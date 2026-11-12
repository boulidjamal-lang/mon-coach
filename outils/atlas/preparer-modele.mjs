// Écrit dans assets/atlas/atlas.bin la préparation que le moteur ferait à chaque chargement : les ombres de contact
// éclaircies (eclaircirContacts) et les poids repris autour de l'épaule et de l'avant-bras (reponderer), calculés par
// le moteur lui-même sur le corps étoffé (carrure 1). Les sommets et les triangles du fichier ne changent pas : la
// préparation est un bloc ajouté après eux, dont l'en-tête donne l'adresse (voir appliquerPreparation dans
// atlas3d.js) ; seuls les sommets qui changent y figurent. Le moteur l'applique au lieu de refaire le calcul (une
// seconde de moins à la première ouverture sur iPhone) ; sans lui, ou pour d'autres réglages, il calcule.
// À relancer après toute retouche de eclaircirContacts, reponderer ou etoffer : un test de l'appli vérifie que le
// bloc est exactement ce que le moteur calculerait.
// Usage : node outils/atlas/preparer-modele.mjs [fichier]   (par défaut assets/atlas/atlas.bin)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
const ici = path.dirname(new URL(import.meta.url).pathname), racine = path.join(ici, '..', '..');
const fichier = process.argv[2] || path.join(racine, 'assets', 'atlas', 'atlas.bin');
const brut = fs.readFileSync(fichier);
if (brut.readUInt32LE(0) !== 0x41514e41) throw new Error("ce fichier n'est pas un modèle Anqā");
const versionFichier = brut.readUInt32LE(4), lg = brut.readUInt32LE(8);
const entete = JSON.parse(brut.subarray(12, 12 + lg).toString('utf8'));
delete entete.preparation;   // (une préparation déjà là est refaite)
const pas = entete.octetsParSommet, debutS = 12 + lg, octS = entete.sommets * pas, octI = entete.triangles * 3 * 2;
const sommets = Buffer.from(brut.subarray(debutS, debutS + octS)), indices = Buffer.from(brut.subarray(debutS + octS, debutS + octS + octI));
// Le moteur, tel que l'appli le charge.
const ctx = { window: {}, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, DataView, JSON, Object, Array, Infinity, console, Map, WeakMap };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(racine, 'assets', 'atlas', 'atlas3d.js'), 'utf8'), ctx);
const A = ctx.window.AnqaAtlas, CARRURE = 1;
const E = JSON.parse(JSON.stringify(entete)), n0 = E.squelette.length;
let b = new Uint8Array(sommets);
const os = (v, o) => b[o + 10] === E.os.pair || b[o + 10] === E.os.impair;
const r = A.etoffer(b, pas, E.boite, E.squelette, CARRURE, os); b = r.sommets; E.boite = r.boite;
A.eclaircirContacts(b, pas, E, os);
A.reponderer(b, pas, E, new Uint16Array(indices.buffer.slice(indices.byteOffset, indices.byteOffset + octI)), os);
// Ce qui change, sommet par sommet.
const N = entete.sommets, nb = (N + 7) >> 3, bo = new Uint8Array(nb), bp = new Uint8Array(nb), vo = [], vp = [];
for (let v = 0; v < N; v++) {
  const o = v * pas;
  if (b[o + 6] !== sommets[o + 6]) { bo[v >> 3] |= 1 << (v & 7); vo.push(b[o + 6]); }
  let change = false; for (let k = 12; k < 20; k++) if (b[o + k] !== sommets[o + k]) change = true;
  if (change) { bp[v >> 3] |= 1 << (v & 7); for (let k = 12; k < 20; k++) vp.push(b[o + k]); }
}
const bloc = Buffer.concat([Buffer.from(bo), Buffer.from(vo), Buffer.from(bp), Buffer.from(vp)]);
// L'en-tête, avec l'adresse du bloc (après les triangles, alignée sur 4 octets) ; il est complété d'espaces jusqu'à un
// multiple de 4, comme les autres en-têtes du modèle.
const prep = { version: A.PREPARATION_VERSION, carrure: CARRURE, articulationsFichier: n0, attaches: E.squelette.slice(n0), nOmbre: vo.length, nPoids: vp.length / 8, octets: bloc.length, debut: 0 };
let texte = '';
for (let tour = 0; tour < 4; tour++) {
  texte = JSON.stringify(Object.assign({}, entete, { preparation: prep }));
  while (Buffer.byteLength(texte) % 4) texte += ' ';
  const fin = 12 + Buffer.byteLength(texte) + octS + octI, debut = Math.ceil(fin / 4) * 4;
  if (prep.debut === debut) break;
  prep.debut = debut;
}
const tete = Buffer.alloc(12); tete.writeUInt32LE(0x41514e41, 0); tete.writeUInt32LE(versionFichier, 4); tete.writeUInt32LE(Buffer.byteLength(texte), 8);
const corps = Buffer.concat([tete, Buffer.from(texte), sommets, indices]), bourrage = Buffer.alloc(prep.debut - corps.length);
const sortie = Buffer.concat([corps, bourrage, bloc]);
if (sortie.length !== prep.debut + prep.octets) throw new Error('adresse du bloc fausse');
fs.writeFileSync(fichier, sortie);
console.log(`écrit ${path.relative(racine, fichier)} : ${(sortie.length / 1e6).toFixed(2)} Mo (${(bloc.length / 1e3).toFixed(0)} ko de préparation : ${vo.length} ombres, ${vp.length / 8} sommets aux poids repris, ${prep.attaches.length} attaches)`);
