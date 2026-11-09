/* Un Postgres local éphémère pour les tests SQL : initdb dans un dossier
   temporaire, démarrage sur un socket Unix (pas de port réseau), psql pour
   parler à la base. Postgres refuse de tourner en root : sous root, on passe
   par l'utilisateur système « postgres » (runuser). Renvoie null si Postgres
   n'est pas installé : les tests SQL sont alors sautés, en le disant. */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function binaire(nom) {
  const candidats = [nom, ...fs.existsSync('/usr/lib/postgresql') ? fs.readdirSync('/usr/lib/postgresql').sort().reverse().map(v => `/usr/lib/postgresql/${v}/bin/${nom}`) : []];
  for (const c of candidats) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}
function commeUtilisateur(args) {
  // Sous root : runuser -u postgres -- cmd… ; sinon la commande telle quelle.
  if (process.getuid && process.getuid() === 0) return ['runuser', ['-u', 'postgres', '--', ...args]];
  return [args[0], args.slice(1)];
}
function lancer(args, options) {
  const [cmd, a] = commeUtilisateur(args);
  return execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function demarrerPostgres() {
  const initdb = binaire('initdb'), pgctl = binaire('pg_ctl'), psql = binaire('psql');
  if (!initdb || !pgctl || !psql) return null;
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'askesis-pg-'));
  const donnees = path.join(dossier, 'donnees'), sockets = path.join(dossier, 'sockets');
  fs.mkdirSync(sockets);
  if (process.getuid && process.getuid() === 0) execFileSync('chown', ['-R', 'postgres:postgres', dossier]);
  lancer([initdb, '-D', donnees, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8']);
  lancer([pgctl, '-D', donnees, '-w', '-o', `-c listen_addresses='' -k ${sockets} -c fsync=off -c synchronous_commit=off`, '-l', path.join(dossier, 'journal.txt'), 'start']);
  const sql = (texte, options = {}) => {
    const args = [psql, '-X', '-q', '-h', sockets, '-U', 'postgres', '-d', options.base || 'postgres', '-v', 'ON_ERROR_STOP=1'];
    if (options.fichier) args.push('-f', options.fichier);
    const [cmd, a] = commeUtilisateur(args);
    const r = spawnSync(cmd, a, { encoding: 'utf8', input: options.fichier ? undefined : texte, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql a échoué').trim());
    return r.stdout;
  };
  const arreter = () => { try { lancer([pgctl, '-D', donnees, '-m', 'immediate', 'stop']); } catch (e) {} try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) {} };
  return { sql, arreter, sockets, dossier };
}
module.exports = { demarrerPostgres };
