// Le registre des muscles de l'atlas : pour chaque structure de Z-Anatomy retenue, son identifiant stable,
// son nom français, sa région, et son lien avec les groupes et faisceaux d'Anqā.
// - APP : les muscles reliés à l'entraînement, décrits à la main (nom d'usage, groupe, faisceau, rôle).
//   rôle : 'principal' (moteur du groupe), 'synergiste' (aide), 'stabilisateur' (tient l'articulation).
// - Les autres muscles gardés (tête, cou, main, pied, profonds) prennent leur nom officiel (table TA2) et
//   n'ont pas de lien avec l'entraînement : ils restent neutres sur la carte.
// - EXCLUS : muscles internes sans intérêt ici (larynx, pharynx, langue, œil, plancher pelvien…).

const A = (groupe, faisceau = null, role = 'principal') => ({ groupe, faisceau, role });
/* nom Z-Anatomy (sans le côté) -> [identifiant, nom d'usage, appartenances] */
export const APP = {
  // Épaule
  'Clavicular part of deltoid muscle': ['deltoide_anterieur', 'Deltoïde antérieur', [A('epaules', 'delt_ant')]],
  'Acromial part of deltoid muscle': ['deltoide_lateral', 'Deltoïde latéral', [A('epaules', 'delt_lat')]],
  'Scapular spinal part of deltoid muscle': ['deltoide_posterieur', 'Deltoïde postérieur', [A('epaules', 'delt_post')]],
  'Supraspinatus muscle': ['supra_epineux', 'Supra-épineux', [A('epaules', null, 'stabilisateur')]],
  'Infraspinatus muscle': ['infra_epineux', 'Infra-épineux', [A('epaules', null, 'stabilisateur')]],
  'Teres minor muscle': ['petit_rond', 'Petit rond', [A('epaules', null, 'stabilisateur')]],
  'Subscapularis muscle': ['subscapulaire', 'Subscapulaire', [A('epaules', null, 'stabilisateur')]],
  // Thorax
  'Clavicular head of pectoralis major muscle': ['pectoral_claviculaire', 'Grand pectoral · faisceau claviculaire', [A('pectoraux', 'pec_haut')]],
  'Sternocostal head of pectoralis major muscle': ['pectoral_sternal', 'Grand pectoral · faisceau sternal', [A('pectoraux', 'pec_milieu')]],
  '(Abdominal part of pectoralis major muscle)': ['pectoral_abdominal', 'Grand pectoral · faisceau abdominal', [A('pectoraux', 'pec_bas')]],
  'Pectoralis minor muscle': ['petit_pectoral', 'Petit pectoral', [A('pectoraux', null, 'synergiste')]],
  'Serratus anterior muscle': ['dentele_anterieur', 'Grand dentelé', [A('pectoraux', null, 'stabilisateur')]],
  // Dos
  'Latissimus dorsi muscle': ['grand_dorsal', 'Grand dorsal', [A('dos', 'dos_largeur')]],
  'Teres major muscle': ['grand_rond', 'Grand rond', [A('dos', 'dos_largeur', 'synergiste')]],
  // (Dans Z-Anatomy, « Ascending part » désigne les fibres du haut et « Descending part » celles du bas : on se fie à la place.)
  'Ascending part of trapezius muscle': ['trapeze_superieur', 'Trapèze supérieur', [A('trapezes')]],
  'Transverse part of trapezius muscle': ['trapeze_moyen', 'Trapèze moyen', [A('dos', 'dos_epaisseur'), A('trapezes', null, 'synergiste')]],
  'Descending part of trapezius muscle': ['trapeze_inferieur', 'Trapèze inférieur', [A('dos', 'dos_epaisseur'), A('trapezes', null, 'synergiste')]],
  'Rhomboid major muscle': ['grand_rhomboide', 'Grand rhomboïde', [A('dos', 'dos_epaisseur')]],
  'Rhomboid minor muscle': ['petit_rhomboide', 'Petit rhomboïde', [A('dos', 'dos_epaisseur')]],
  'Levator scapulae': ['elevateur_scapula', 'Élévateur de la scapula', [A('trapezes', null, 'synergiste')]],
  'Iliocostalis lumborum muscle': ['ilio_costal_lombes', 'Ilio-costal des lombes', [A('lombaires')]],
  'Iliocostalis thoracis muscle': ['ilio_costal_thorax', 'Ilio-costal du thorax', [A('lombaires')]],
  'Longissimus thoracis muscle': ['longissimus_thorax', 'Longissimus du thorax', [A('lombaires')]],
  'Spinalis thoracis muscle': ['epineux_thorax', 'Épineux du thorax', [A('lombaires')]],
  'Multifidus lumborum muscle': ['multifide_lombes', 'Multifide des lombes', [A('lombaires', null, 'stabilisateur')]],
  'Multifidus thoracis muscle': ['multifide_thorax', 'Multifide du thorax', [A('lombaires', null, 'stabilisateur')]],
  'Quadratus lumborum muscle': ['carre_lombes', 'Carré des lombes', [A('lombaires', null, 'synergiste')]],
  // Abdomen
  'Rectus abdominis muscle': ['grand_droit_abdomen', "Grand droit de l'abdomen", [A('abdos')]],
  'External abdominal oblique muscle': ['oblique_externe', 'Oblique externe', [A('abdos')]],
  'Internal abdominal oblique muscle': ['oblique_interne', 'Oblique interne', [A('abdos', null, 'synergiste')]],
  'Transversus abdominis muscle': ['transverse_abdomen', "Transverse de l'abdomen", [A('abdos', null, 'stabilisateur')]],
  'Pyramidalis muscle': ['pyramidal', 'Pyramidal', [A('abdos', null, 'synergiste')]],
  'Psoas major': ['grand_psoas', 'Grand psoas', [A('abdos', null, 'synergiste')]],
  'Iliacus muscle': ['iliaque', 'Iliaque', [A('abdos', null, 'synergiste')]],
  // Bras
  'Long head of biceps brachii': ['biceps_long', 'Biceps brachial · longue portion', [A('biceps', 'bic_long')]],
  'Short head of biceps brachii': ['biceps_court', 'Biceps brachial · courte portion', [A('biceps', 'bic_court')]],
  'Brachialis muscle': ['brachial', 'Brachial', [A('biceps', 'bic_brachial')]],
  'Coracobrachialis muscle': ['coraco_brachial', 'Coraco-brachial', [A('biceps', null, 'synergiste')]],
  'Long head of triceps brachii': ['triceps_long', 'Triceps · longue portion', [A('triceps', 'tri_long')]],
  'Lateral head of triceps brachii': ['triceps_lateral', 'Triceps · vaste latéral', [A('triceps', 'tri_lat')]],
  'Medial head of triceps brachii': ['triceps_medial', 'Triceps · vaste médial', [A('triceps', 'tri_med')]],
  'Anconeus muscle': ['ancone', 'Anconé', [A('triceps', null, 'synergiste')]],
  // Avant-bras
  'Brachioradialis muscle': ['brachio_radial', 'Brachio-radial', [A('avant_bras'), A('biceps', 'bic_brachial', 'synergiste')]],
  'Superficial head of pronator teres': ['rond_pronateur_humeral', 'Rond pronateur · chef huméral', [A('avant_bras', null, 'synergiste')]],
  'Deep head of pronator teres': ['rond_pronateur_ulnaire', 'Rond pronateur · chef ulnaire', [A('avant_bras', null, 'synergiste')]],
  'Flexor carpi radialis': ['flechisseur_radial_carpe', 'Fléchisseur radial du carpe', [A('avant_bras')]],
  'Palmaris longus muscle': ['long_palmaire', 'Long palmaire', [A('avant_bras')]],
  'Humeral head of flexor carpi ulnaris': ['flechisseur_ulnaire_carpe_humeral', 'Fléchisseur ulnaire du carpe · chef huméral', [A('avant_bras')]],
  'Ulnar head of flexor carpi ulnaris': ['flechisseur_ulnaire_carpe_ulnaire', 'Fléchisseur ulnaire du carpe · chef ulnaire', [A('avant_bras')]],
  'Humero-ulnar head of flexor digitorum superficialis': ['flechisseur_superficiel_doigts_humero_ulnaire', 'Fléchisseur superficiel des doigts · chef huméro-ulnaire', [A('avant_bras')]],
  'Radial head of flexor digitorum superficialis': ['flechisseur_superficiel_doigts_radial', 'Fléchisseur superficiel des doigts · chef radial', [A('avant_bras')]],
  'Flexor digitorum profundus': ['flechisseur_profond_doigts', 'Fléchisseur profond des doigts', [A('avant_bras', null, 'synergiste')]],
  'Flexor pollicis longus': ['long_flechisseur_pouce', 'Long fléchisseur du pouce', [A('avant_bras', null, 'synergiste')]],
  'Pronator quadratus': ['carre_pronateur', 'Carré pronateur', [A('avant_bras', null, 'synergiste')]],
  'Supinator': ['supinateur', 'Supinateur', [A('avant_bras', null, 'synergiste')]],
  'Extensor carpi radialis longus': ['long_extenseur_radial_carpe', 'Long extenseur radial du carpe', [A('avant_bras')]],
  'Extensor carpi radialis brevis': ['court_extenseur_radial_carpe', 'Court extenseur radial du carpe', [A('avant_bras')]],
  'Extensor digitorum': ['extenseur_doigts', 'Extenseur des doigts', [A('avant_bras')]],
  'Extensor digiti minimi': ['extenseur_petit_doigt', 'Extenseur du petit doigt', [A('avant_bras', null, 'synergiste')]],
  'Humeral head of extensor carpi ulnaris': ['extenseur_ulnaire_carpe_humeral', 'Extenseur ulnaire du carpe · chef huméral', [A('avant_bras')]],
  'Ulnar head of extensor carpi ulnaris': ['extenseur_ulnaire_carpe_ulnaire', 'Extenseur ulnaire du carpe · chef ulnaire', [A('avant_bras')]],
  'Abductor pollicis longus': ['long_abducteur_pouce', 'Long abducteur du pouce', [A('avant_bras', null, 'synergiste')]],
  'Extensor pollicis brevis': ['court_extenseur_pouce', 'Court extenseur du pouce', [A('avant_bras', null, 'synergiste')]],
  'Extensor pollicis longus': ['long_extenseur_pouce', 'Long extenseur du pouce', [A('avant_bras', null, 'synergiste')]],
  'Extensor indicis': ['extenseur_index', "Extenseur de l'index", [A('avant_bras', null, 'synergiste')]],
  // Bassin et hanche
  'Gluteus maximus muscle': ['grand_fessier', 'Grand fessier', [A('fessiers', 'fes_grand')]],
  'Gluteus medius muscle': ['moyen_fessier', 'Moyen fessier', [A('fessiers', 'fes_moyen')]],
  'Gluteus minimus muscle': ['petit_fessier', 'Petit fessier', [A('fessiers', 'fes_moyen', 'synergiste')]],
  'Tensor fasciae latae': ['tenseur_fascia_lata', 'Tenseur du fascia lata', [A('fessiers', null, 'synergiste')]],
  'Piriformis muscle': ['piriforme', 'Piriforme', [A('fessiers', null, 'stabilisateur')]],
  'Obturator internus': ['obturateur_interne', 'Obturateur interne', [A('fessiers', null, 'stabilisateur')]],
  'Obturator externus': ['obturateur_externe', 'Obturateur externe', [A('fessiers', null, 'stabilisateur')]],
  'Superior gemellus muscle': ['jumeau_superieur', 'Jumeau supérieur', [A('fessiers', null, 'stabilisateur')]],
  'Inferior gemellus muscle': ['jumeau_inferieur', 'Jumeau inférieur', [A('fessiers', null, 'stabilisateur')]],
  'Quadratus femoris muscle': ['carre_femoral', 'Carré fémoral', [A('fessiers', null, 'stabilisateur')]],
  // Cuisse
  'Rectus femoris muscle': ['droit_femoral', 'Droit fémoral', [A('quadriceps', 'quad_droit')]],
  'Vastus lateralis muscle': ['vaste_lateral', 'Vaste latéral', [A('quadriceps', 'quad_ext')]],
  'Vastus medialis muscle': ['vaste_medial', 'Vaste médial', [A('quadriceps', 'quad_int')]],
  'Vastus intermedius muscle': ['vaste_intermediaire', 'Vaste intermédiaire', [A('quadriceps')]],
  'Long head of biceps femoris': ['biceps_femoral_long', 'Biceps fémoral · longue portion', [A('ischios', 'isch_biceps')]],
  'Short head of biceps femoris': ['biceps_femoral_court', 'Biceps fémoral · courte portion', [A('ischios', 'isch_biceps')]],
  'Semitendinosus muscle': ['semi_tendineux', 'Semi-tendineux', [A('ischios', 'isch_semi')]],
  'Semimembranosus muscle': ['semi_membraneux', 'Semi-membraneux', [A('ischios', 'isch_semi')]],
  'Adductor longus': ['long_adducteur', 'Long adducteur', [A('adducteurs')]],
  'Adductor brevis': ['court_adducteur', 'Court adducteur', [A('adducteurs')]],
  'Adductor magnus': ['grand_adducteur', 'Grand adducteur', [A('adducteurs')]],
  '(Adductor minimus)': ['petit_adducteur', 'Petit adducteur', [A('adducteurs', null, 'synergiste')]],
  'Gracilis muscle': ['gracile', 'Gracile', [A('adducteurs')]],
  'Pectineus muscle': ['pectine', 'Pectiné', [A('adducteurs', null, 'synergiste')]],
  // Jambe
  'Medial head of gastrocnemius': ['gastrocnemien_medial', 'Gastrocnémien médial', [A('mollets', 'mol_gastro')]],
  'Lateral head of gastrocnemius': ['gastrocnemien_lateral', 'Gastrocnémien latéral', [A('mollets', 'mol_gastro')]],
  'Soleus muscle': ['soleaire', 'Soléaire', [A('mollets', 'mol_soleaire')]],
  'Plantaris muscle': ['plantaire', 'Plantaire', [A('mollets', null, 'synergiste')]],
  'Tibialis anterior muscle': ['tibial_anterieur', 'Tibial antérieur', [A('mollets', 'mol_tibial')]]
};
/* Noms d'usage de quelques muscles sans lien avec l'entraînement (les autres prennent le nom officiel). */
export const NOMS = {
  'Sartorius muscle': 'Sartorius', 'Sternocleidomastoid muscle': 'Sterno-cléido-mastoïdien', 'Fibularis longus muscle': 'Long fibulaire', 'Fibularis brevis muscle': 'Court fibulaire',
  'Fibularis tertius muscle': 'Troisième fibulaire', 'Extensor digitorum longus': 'Long extenseur des orteils', 'Extensor hallucis longus': "Long extenseur de l'hallux",
  'Tibialis posterior muscle': 'Tibial postérieur', 'Flexor digitorum longus': 'Long fléchisseur des orteils', 'Flexor hallucis longus': "Long fléchisseur de l'hallux",
  'Popliteus muscle': 'Poplité', 'Subclavius muscle': 'Subclavier', 'External intercostal muscles': 'Intercostaux externes', 'Internal intercostal muscles': 'Intercostaux internes',
  'Serratus posterior inferior muscle': 'Dentelé postéro-inférieur', 'Serratus posterior superior muscle': 'Dentelé postéro-supérieur', 'Semispinalis thoracis muscle': 'Semi-épineux du thorax',
  '(Opponens digiti minimi muscle of foot)': 'Opposant du petit orteil', 'Levator nasolabialis': 'Élévateur naso-labial', 'Iliocostalis colli muscle': 'Ilio-costal du cou',
  'Orbital part of orbicularis oculi': "Orbiculaire de l'œil · partie orbitaire", 'Palpebral part of orbicularis oculi': "Orbiculaire de l'œil · partie palpébrale",
  'Multifidus colli muscle': 'Multifide du cou', 'Omohyoid muscle': 'Omo-hyoïdien', 'Sternohyoid muscle': 'Sterno-hyoïdien', 'Temporoparietalis muscle': 'Temporo-pariétal',
  'Oblique head of adductor pollicis': 'Adducteur du pouce · chef oblique', 'Transverse head of adductor pollicis': 'Adducteur du pouce · chef transverse',
  'Deep head of flexor pollicis brevis': 'Court fléchisseur du pouce · chef profond', 'Superficial head of flexor pollicis brevis': 'Court fléchisseur du pouce · chef superficiel',
  'Flexor digiti minimi of hand': 'Court fléchisseur du petit doigt', 'Flexor digiti minimi of foot': 'Court fléchisseur du petit orteil',
  'Lateral head of flexor hallucis brevis': "Court fléchisseur de l'hallux · chef latéral", 'Medial head of flexor hallucis brevis': "Court fléchisseur de l'hallux · chef médial",
  'Oblique head of adductor hallucis': "Adducteur de l'hallux · chef oblique", 'Transverse head of adductor hallucis': "Adducteur de l'hallux · chef transverse",
  'Temporalis muscle': 'Temporal', 'Superficial part of masseter': 'Masséter · partie superficielle', 'Deep part of masseter': 'Masséter · partie profonde', 'Frontalis muscle': 'Frontal', 'Occipitalis muscle': 'Occipital'
};
/* Muscles écartés : internes, sans intérêt pour un atlas d'entraînement. */
export const EXCLUS = /arytenoid|cricothyroid|pharyn|palatopharyngeus|genioglossus|hyoglossus|thyro-|thyrohyoid|sternothyroid|rectus muscle|oblique muscle\.|^superior oblique|^inferior oblique|palpebrae|tarsus|trochlea|tendinous ring|coccyge|pubo-analis|anal sphincter|levator ani|diaphragm|transversus thoracis|innermost intercostal|levatores|intertransversarii|interspinales|rotatores|platysma|pterygoid|stylohyoid|geniohyoid|mylohyoid|digastric|rectus (anterior|lateralis|posterior)|obliquus|longus capitis|longus colli/i;

/* Région du corps, d'après le nom. */
const REGIONS = [
  ['tete', /frontalis|occipitalis|temporoparietalis|orbicularis|zygomaticus|levator labii|levator anguli|levator nasolabialis|nasalis|procerus|corrugator|depressor|mentalis|risorius|bucinator|masseter|temporalis/i],
  ['cou', /sternocleidomastoid|scalenus|splenius|semispinalis colli|semispinalis capitis|longissimus capitis|longissimus colli|spinalis capitis|spinalis colli|iliocostalis colli|multifidus colli|omohyoid|sternohyoid/i],
  ['main', /of hand|(abductor|flexor) pollicis brevis|opponens pollicis|adductor pollicis|palmar interossei/i],
  ['pied', /of foot|hallucis brevis|abductor hallucis|adductor hallucis|digitorum brevis|quadratus plantae|plantar interossei/i],
  ['epaule', /deltoid|supraspinatus|infraspinatus|teres minor|teres major|subscapularis/i],
  ['thorax', /pectoralis|serratus anterior|subclavius|intercostal/i],
  ['dos', /trapezius|latissimus|rhomboid|levator scapulae|iliocostalis|longissimus|spinalis|multifidus|serratus posterior|semispinalis|quadratus lumborum/i],
  ['abdomen', /rectus abdominis|abdominal oblique|transversus abdominis|pyramidalis/i],
  ['bassin', /glute|tensor fasciae|piriformis|obturator|gemellus|quadratus femoris|psoas|iliacus/i],
  ['bras', /biceps brachii|brachialis|coracobrachialis|triceps|anconeus/i],
  ['avant_bras', /brachioradialis|pronator|flexor carpi|palmaris|flexor digitorum (superficialis|profundus)|flexor pollicis longus|supinator|extensor carpi|extensor digitorum$|extensor digiti minimi|abductor pollicis longus|extensor pollicis|extensor indicis/i],
  ['cuisse', /rectus femoris|vastus|sartorius|biceps femoris|semitendinosus|semimembranosus|adductor (longus|brevis|magnus|minimus)|gracilis|pectineus/i],
  ['jambe', /gastrocnemius|soleus|plantaris|popliteus|tibialis|fibularis|digitorum longus|hallucis longus/i]
];
export const NOMS_REGIONS = { tete: 'Tête', cou: 'Cou', epaule: 'Épaule', thorax: 'Thorax', dos: 'Dos', abdomen: 'Abdomen', bassin: 'Bassin et hanche', bras: 'Bras', avant_bras: 'Avant-bras', main: 'Main', cuisse: 'Cuisse', jambe: 'Jambe', pied: 'Pied' };
export function regionDe(nom) { for (const [r, re] of REGIONS) if (re.test(nom)) return r; return null; }
const sansAccent = s => String(s).replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slug = s => sansAccent(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/* Nom officiel français nettoyé (« Muscle anconé » -> « Anconé »). */
export const nomOfficiel = fr => { let n = fr.replace(/^Muscles? /, '').replace(/^M\. /, ''); return n.charAt(0).toUpperCase() + n.slice(1); };

/* Structures de contexte : tendons et bandelettes gardés pour la lecture de l'anatomie. */
export const CONTEXTE = {
  // [identifiant, nom, latin, anglais, région, type] — 'aponevrose' : lame fibreuse fine, dessinée en voile translucide.
  'Iliotibial tract': ['tractus_ilio_tibial', 'Tractus ilio-tibial', 'Tractus iliotibialis', 'Iliotibial tract', 'cuisse', 'aponevrose'],
  'Calcaneal tendon': ['tendon_calcaneen', "Tendon calcanéen (d'Achille)", 'Tendo calcaneus', 'Calcaneal tendon', 'jambe', 'tendon'],
  'Linea alba': ['ligne_blanche', 'Ligne blanche', 'Linea alba', 'Linea alba', 'abdomen', 'tendon']
};
/* Noms latins et anglais corrigés ou absents de la table officielle.
   Dans Z-Anatomy, les deux parties extrêmes du trapèze portent le nom l'une de l'autre : on rétablit le bon. */
export const OFFICIELS = {
  'Ascending part of trapezius muscle': { la: 'Pars descendens musculi trapezii', en: 'Descending (superior) part of trapezius muscle' },
  'Descending part of trapezius muscle': { la: 'Pars ascendens musculi trapezii', en: 'Ascending (inferior) part of trapezius muscle' },
  '(Abdominal part of pectoralis major muscle)': { la: 'Pars abdominalis musculi pectoralis majoris', en: 'Abdominal part of pectoralis major muscle' },
  '(Adductor minimus)': { la: 'Musculus adductor minimus', en: 'Adductor minimus muscle' },
  '(Opponens digiti minimi muscle of foot)': { la: 'Musculus opponens digiti minimi pedis', en: 'Opponens digiti minimi muscle of foot' },
  'Tensor fasciae latae': { la: 'Musculus tensor fasciae latae' },
  'Flexor digiti minimi of foot': { la: 'Musculus flexor digiti minimi brevis pedis' },
  'Bucinator': { la: 'Musculus buccinator' }
};
