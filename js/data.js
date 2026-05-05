'use strict';

/* ============================================================
   Constants, theme presets, language registry, default cover
   SVGs, and built-in stories.
   ============================================================ */
const STORAGE_KEY = 'germanApp.v1';
const CURRENT_SCHEMA = 3;
const MASTERED_INTERVAL_DAYS = 21;

/* ------------------------------------------------------------
   BUILT-IN LANGUAGES — German theme + metadata. The shape here
   must match what an "uploaded language" JSON would also use.
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   THEME PRESETS — picker options in Settings → Languages.
   Each language stores its own `theme.*`; the picker just rewrites
   those fields. "Custom" is implicit (shown when no preset matches).
   ------------------------------------------------------------ */
const THEME_PRESETS = {
  flag_de: {
    name: 'German Flag',
    theme: {
      gradient1: '#dc2626', gradient2: '#ffce00', gradient3: '#f97316',
      bgFrom:   '#0a0a0a', bgVia: '#1a0606', bgTo: '#14110a',
      accent:   '#ffce00'
    }
  },
  flag_at: {
    // Austrian flag — red / white / red. True 3-stop gradient with
    // pure white in the middle. The slightly different reds at the
    // ends keep the linear gradient feeling like a gradient.
    name: 'Austrian Flag',
    theme: {
      gradient1: '#ed2939', gradient2: '#ffffff', gradient3: '#c1121f',
      bgFrom:   '#0a0606', bgVia: '#1a0606', bgTo: '#0a0a0a',
      accent:   '#ed2939'
    }
  },
  flag_it: {
    // Italian Tricolore — green / white / red. True 3-stop gradient
    // matching the actual flag colors.
    name: 'Italian Flag',
    theme: {
      gradient1: '#009246', gradient2: '#ffffff', gradient3: '#ce2b37',
      bgFrom:   '#0a0a0a', bgVia: '#061509', bgTo: '#14060a',
      accent:   '#009246'
    }
  },
  cosmic: {
    name: 'Cosmic',
    theme: {
      gradient1: '#a855f7', gradient2: '#ec4899', gradient3: '#06b6d4',
      bgFrom:   '#0a0118', bgVia: '#150030', bgTo: '#001428',
      accent:   '#a855f7'
    }
  },
  sunset: {
    name: 'Sunset',
    theme: {
      gradient1: '#f97316', gradient2: '#ec4899', gradient3: '#fbbf24',
      bgFrom:   '#1a0a00', bgVia: '#2a0f1a', bgTo: '#0a0500',
      accent:   '#f97316'
    }
  },
  ocean: {
    name: 'Ocean',
    theme: {
      gradient1: '#0ea5e9', gradient2: '#06b6d4', gradient3: '#10b981',
      bgFrom:   '#001428', bgVia: '#001f3f', bgTo: '#001a14',
      accent:   '#06b6d4'
    }
  },
  forest: {
    name: 'Forest',
    theme: {
      gradient1: '#10b981', gradient2: '#84cc16', gradient3: '#22d3ee',
      bgFrom:   '#03110a', bgVia: '#0a1f15', bgTo: '#001a14',
      accent:   '#10b981'
    }
  }
};

// Match a stored language theme to a preset id (or null = Custom).
function matchPresetId(theme) {
  if (!theme) return null;
  for (const [id, p] of Object.entries(THEME_PRESETS)) {
    const t = p.theme;
    if (t.gradient1 === theme.gradient1 &&
        t.gradient2 === theme.gradient2 &&
        t.gradient3 === theme.gradient3 &&
        t.bgFrom   === theme.bgFrom   &&
        t.bgVia    === theme.bgVia    &&
        t.bgTo     === theme.bgTo     &&
        t.accent   === theme.accent) return id;
  }
  return null;
}

const BUILTIN_LANGUAGES = {
  de: {
    id: 'de',
    name: 'German',
    flag: '🇩🇪',
    ttsLang: 'de-DE',
    teaser: 'A1–B2 journey through everyday German.',
    levels: ['A1', 'A2', 'B1', 'B2'],
    // German default = Austrian Flag (red/cream/red). Both German Flag
    // (Bundesflagge) and Austrian Flag presets are available in the
    // Settings → Languages → Theme dropdown.
    theme: { ...THEME_PRESETS.flag_at.theme }
  },
  it: {
    id: 'it',
    name: 'Italian',
    flag: '🇮🇹',
    ttsLang: 'it-IT',
    teaser: "Bianca's story — A1 through B2 across Lake Como and Milan.",
    levels: ['A1', 'A2', 'B1', 'B2'],
    // Italian series uses {{PROTAGONIST}} substitution — Bianca is
    // the default; protagonistGender is fixed for the series so
    // adjective/article agreement in the prose still works.
    defaultProtagonist: 'Bianca',
    suggestedProtagonistNames: ['Bianca', 'Sofia', 'Giulia', 'Alice', 'Chiara', 'Martina'],
    protagonistGender: 'feminine',
    // Italian default = Tricolore preset (green / cream / red).
    theme: { ...THEME_PRESETS.flag_it.theme },
    coverImage: 'images/it/lang-cover.jpg'
  }
};

/* ------------------------------------------------------------
   BUILT-IN STORY 1 — embedded as JS literal. Identical shape
   to ~/german-app/story-1.json so the same ingestion code can
   handle uploaded stories later.
   ------------------------------------------------------------ */
const BUILTIN_STORY_1 = {
  schemaVersion: 1,
  languageId: 'de',
  id: 'story-1',
  _storyVersion: 4,  // v4: full-coverage vocabulary expansion
  title: 'Ein neuer Tag',
  level: 'A1',
  order: 1,
  grammarFocus: ['verb-second', 'accusative', 'possessives', 'separable verbs', 'modal verbs', 'weil clauses', 'dative prepositions'],
  sentences: [
    { de: 'Ich heiße Max.', en: 'My name is Max.', note: 'Verb-second position. Reflexive verb sich heißen.' },
    { de: 'Ich bin dreißig Jahre alt und ich wohne in Berlin.', en: 'I am thirty years old and I live in Berlin.', note: null },
    { de: 'Ich habe eine Schwester.', en: 'I have a sister.', note: 'Accusative: eine Schwester (feminine, no change from nominative).' },
    { de: 'Sie heißt Anna.', en: 'Her name is Anna.', note: null },
    { de: 'Anna ist sehr nett.', en: 'Anna is very nice.', note: null },
    { de: 'Heute ist Montag.', en: 'Today is Monday.', note: 'Time expression first → verb still in 2nd position.' },
    { de: 'Es ist sieben Uhr.', en: 'It is seven o\'clock.', note: null },
    { de: 'Ich stehe auf und ich gehe in die Küche.', en: 'I get up and I go into the kitchen.', note: 'Separable verb: aufstehen → stehe ... auf.' },
    { de: 'Ich mache Kaffee.', en: 'I make coffee.', note: null },
    { de: 'Der Kaffee ist heiß und schwarz.', en: 'The coffee is hot and black.', note: null },
    { de: 'Ich trinke den Kaffee langsam.', en: 'I drink the coffee slowly.', note: 'Accusative: der → den (masculine direct object).' },
    { de: 'Ich esse auch ein Brot mit Butter.', en: 'I also eat bread with butter.', note: 'Mit + dative.' },
    { de: 'Das Brot ist frisch.', en: 'The bread is fresh.', note: null },
    { de: 'Meine Wohnung ist klein, aber schön.', en: 'My apartment is small but beautiful.', note: 'Possessive: meine (feminine, agrees with Wohnung).' },
    { de: 'Sie hat ein Zimmer, eine Küche und ein Bad.', en: 'It has a room, a kitchen and a bathroom.', note: null },
    { de: 'Das Fenster ist groß.', en: 'The window is big.', note: null },
    { de: 'Ich sehe den Himmel.', en: 'I see the sky.', note: 'Accusative: der Himmel → den Himmel.' },
    { de: 'Der Himmel ist blau heute.', en: 'The sky is blue today.', note: null },
    { de: 'Um acht Uhr fahre ich zur Arbeit.', en: 'At eight o\'clock I drive to work.', note: 'Time first, verb 2nd, subject after verb. Zur = zu der (dative contraction).' },
    { de: 'Ich nehme das Fahrrad, weil das Wetter gut ist.', en: 'I take the bicycle because the weather is good.', note: 'Weil sends verb to the END of the clause.' },
    { de: 'Mein Büro ist nicht weit.', en: 'My office is not far.', note: null },
    { de: 'Ich arbeite in einer Bank.', en: 'I work in a bank.', note: 'In + dative (location): einer Bank.' },
    { de: 'Meine Arbeit ist interessant, aber manchmal schwer.', en: 'My work is interesting but sometimes hard.', note: null },
    { de: 'Im Büro sage ich Guten Morgen zu meinen Kollegen.', en: 'In the office I say good morning to my colleagues.', note: 'Zu + dative plural: meinen Kollegen.' },
    { de: 'Mein Chef heißt Herr Weber.', en: 'My boss is called Mr. Weber.', note: null },
    { de: 'Er ist alt und streng, aber fair.', en: 'He is old and strict, but fair.', note: null },
    { de: 'Ich mag ihn.', en: 'I like him.', note: 'Accusative pronoun: er → ihn.' },
    { de: 'Ich sitze an meinem Tisch und ich lese E-Mails.', en: 'I sit at my desk and I read emails.', note: 'An + dative: meinem Tisch (location).' },
    { de: 'Ich schreibe auch viele E-Mails.', en: 'I also write many emails.', note: null },
    { de: 'Der Computer ist neu und schnell.', en: 'The computer is new and fast.', note: null },
    { de: 'Um zwölf Uhr habe ich Hunger.', en: 'At twelve o\'clock I am hungry.', note: null },
    { de: 'Ich gehe in ein Restaurant mit meiner Kollegin Lisa.', en: 'I go to a restaurant with my colleague Lisa.', note: null },
    { de: 'Lisa ist jung und lustig.', en: 'Lisa is young and funny.', note: null },
    { de: 'Sie spricht viel.', en: 'She talks a lot.', note: null },
    { de: 'Ich esse eine Suppe und einen Salat.', en: 'I eat a soup and a salad.', note: 'Accusative: einen Salat (masculine direct object).' },
    { de: 'Lisa isst eine Pizza.', en: 'Lisa eats a pizza.', note: null },
    { de: 'Wir trinken Wasser.', en: 'We drink water.', note: null },
    { de: 'Das Essen ist lecker.', en: 'The food is delicious.', note: null },
    { de: 'Was machst du am Wochenende?', en: 'What are you doing on the weekend?', note: null },
    { de: 'Ich besuche meine Eltern.', en: 'I visit my parents.', note: null },
    { de: 'Sie wohnen in München.', en: 'They live in Munich.', note: null },
    { de: 'Ich bleibe hier.', en: 'I stay here.', note: null },
    { de: 'Ich möchte ein Buch lesen und einen Film sehen.', en: 'I want to read a book and watch a film.', note: 'Modal verb möchten sends infinitives (lesen, sehen) to the END.' },
    { de: 'Am Nachmittag arbeite ich weiter.', en: 'In the afternoon I keep working.', note: null },
    { de: 'Ich habe ein Meeting mit Herrn Weber.', en: 'I have a meeting with Mr. Weber.', note: null },
    { de: 'Wir sprechen über ein neues Projekt.', en: 'We talk about a new project.', note: null },
    { de: 'Das Projekt ist groß und wichtig.', en: 'The project is big and important.', note: null },
    { de: 'Ich kann viel lernen.', en: 'I can learn a lot.', note: 'Modal verb können sends infinitive lernen to the END.' },
    { de: 'Um sechs Uhr fahre ich nach Hause.', en: 'At six o\'clock I drive home.', note: null },
    { de: 'Ich bin müde, aber glücklich.', en: 'I am tired but happy.', note: null },
    { de: 'Zu Hause koche ich Nudeln mit Tomaten.', en: 'At home I cook noodles with tomatoes.', note: null },
    { de: 'Ich höre Musik.', en: 'I listen to music.', note: null },
    { de: 'Die Musik ist schön und ruhig.', en: 'The music is beautiful and calm.', note: null },
    { de: 'Anna ruft mich an.', en: 'Anna calls me.', note: 'Separable verb anrufen → ruft ... an.' },
    { de: 'Hallo Max! Wie geht es dir?', en: 'Hello Max! How are you?', note: 'Dir = dative of du.' },
    { de: 'Gut, danke. Und dir?', en: 'Good, thanks. And you?', note: null },
    { de: 'Auch gut. Kommst du am Samstag zu uns?', en: 'Also good. Are you coming to us on Saturday?', note: null },
    { de: 'Ja, gerne. Ich bringe Wein.', en: 'Yes, gladly. I will bring wine.', note: null },
    { de: 'Ich lese ein Buch.', en: 'I read a book.', note: null },
    { de: 'Das Buch ist auf Deutsch.', en: 'The book is in German.', note: null },
    { de: 'Es ist nicht einfach, aber ich verstehe viel.', en: 'It is not easy, but I understand a lot.', note: null },
    { de: 'Ich lerne jeden Tag neue Wörter.', en: 'I learn new words every day.', note: null },
    { de: 'Um elf Uhr gehe ich ins Bett.', en: 'At eleven o\'clock I go to bed.', note: null },
    { de: 'Morgen ist auch ein Arbeitstag.', en: 'Tomorrow is also a workday.', note: null },
    { de: 'Ich schlafe schnell ein.', en: 'I fall asleep quickly.', note: 'Separable verb einschlafen → schlafe ... ein.' },
    { de: 'Das Leben ist gut.', en: 'Life is good.', note: null }
  ],
  vocabulary: [
    // NOUNS
    { de: 'Kaffee',     en: 'coffee', pos: 'noun', gender: 'der', plural: 'Kaffees' },
    { de: 'Schwester',  en: 'sister', pos: 'noun', gender: 'die', plural: 'Schwestern' },
    { de: 'Bruder',     en: 'brother', pos: 'noun', gender: 'der', plural: 'Brüder', note: 'Umlaut in plural.' },
    { de: 'Wohnung',    en: 'apartment', pos: 'noun', gender: 'die', plural: 'Wohnungen' },
    { de: 'Küche',      en: 'kitchen', pos: 'noun', gender: 'die', plural: 'Küchen' },
    { de: 'Arbeit',     en: 'work, job', pos: 'noun', gender: 'die', plural: 'Arbeiten' },
    { de: 'Büro',       en: 'office', pos: 'noun', gender: 'das', plural: 'Büros' },
    { de: 'Chef',       en: 'boss', pos: 'noun', gender: 'der', plural: 'Chefs', note: "Pronounced 'shef'." },
    { de: 'Buch',       en: 'book', pos: 'noun', gender: 'das', plural: 'Bücher', note: 'Umlaut in plural.' },
    { de: 'Wasser',     en: 'water', pos: 'noun', gender: 'das', note: 'Usually uncountable.' },
    { de: 'Essen',      en: 'food, meal', pos: 'noun', gender: 'das', note: "Also the infinitive 'to eat'." },
    { de: 'Wochenende', en: 'weekend', pos: 'noun', gender: 'das', plural: 'Wochenenden' },
    { de: 'Eltern',     en: 'parents', pos: 'noun', gender: 'die', plural: 'Eltern', note: 'Plural-only noun.' },
    { de: 'Wein',       en: 'wine', pos: 'noun', gender: 'der', plural: 'Weine' },
    { de: 'Wetter',     en: 'weather', pos: 'noun', gender: 'das' },
    { de: 'Jahr',       en: 'year', pos: 'noun', gender: 'das', plural: 'Jahre' },
    { de: 'Brot',       en: 'bread', pos: 'noun', gender: 'das', plural: 'Brote' },
    { de: 'Butter',     en: 'butter', pos: 'noun', gender: 'die' },
    { de: 'Zimmer',     en: 'room', pos: 'noun', gender: 'das', plural: 'Zimmer', note: 'Plural identical to singular.' },
    { de: 'Bad',        en: 'bathroom, bath', pos: 'noun', gender: 'das', plural: 'Bäder' },
    { de: 'Fenster',    en: 'window', pos: 'noun', gender: 'das', plural: 'Fenster' },
    { de: 'Himmel',     en: 'sky, heaven', pos: 'noun', gender: 'der', plural: 'Himmel' },
    { de: 'Bank',       en: 'bank (institution)', pos: 'noun', gender: 'die', plural: 'Banken' },
    { de: 'Tisch',      en: 'table, desk', pos: 'noun', gender: 'der', plural: 'Tische' },
    { de: 'Computer',   en: 'computer', pos: 'noun', gender: 'der', plural: 'Computer' },
    { de: 'E-Mail',     en: 'email', pos: 'noun', gender: 'die', plural: 'E-Mails' },
    { de: 'Hunger',     en: 'hunger', pos: 'noun', gender: 'der', note: "'ich habe Hunger' = I am hungry." },
    { de: 'Restaurant', en: 'restaurant', pos: 'noun', gender: 'das', plural: 'Restaurants' },
    { de: 'Suppe',      en: 'soup', pos: 'noun', gender: 'die', plural: 'Suppen' },
    { de: 'Salat',      en: 'salad', pos: 'noun', gender: 'der', plural: 'Salate' },
    { de: 'Pizza',      en: 'pizza', pos: 'noun', gender: 'die', plural: 'Pizzas/Pizzen' },
    { de: 'Musik',      en: 'music', pos: 'noun', gender: 'die' },
    { de: 'Meeting',    en: 'meeting', pos: 'noun', gender: 'das', plural: 'Meetings' },
    { de: 'Projekt',    en: 'project', pos: 'noun', gender: 'das', plural: 'Projekte' },
    { de: 'Nudel',      en: 'noodle, pasta', pos: 'noun', gender: 'die', plural: 'Nudeln', note: 'Usually used in plural: Nudeln.' },
    { de: 'Tomate',     en: 'tomato', pos: 'noun', gender: 'die', plural: 'Tomaten' },
    { de: 'Film',       en: 'film, movie', pos: 'noun', gender: 'der', plural: 'Filme' },
    { de: 'Nachmittag', en: 'afternoon', pos: 'noun', gender: 'der', plural: 'Nachmittage' },
    { de: 'Bett',       en: 'bed', pos: 'noun', gender: 'das', plural: 'Betten' },
    { de: 'Tag',        en: 'day', pos: 'noun', gender: 'der', plural: 'Tage' },
    { de: 'Wort',       en: 'word', pos: 'noun', gender: 'das', plural: 'Wörter' },
    { de: 'Leben',      en: 'life', pos: 'noun', gender: 'das' },
    { de: 'Haus',       en: 'house, home', pos: 'noun', gender: 'das', plural: 'Häuser', note: "'zu Hause' = at home (frozen, no article)." },
    { de: 'Fahrrad',    en: 'bicycle', pos: 'noun', gender: 'das', plural: 'Fahrräder' },
    { de: 'Morgen',     en: 'morning', pos: 'noun', gender: 'der', note: "'Guten Morgen' = good morning." },
    { de: 'Kollege',    en: 'colleague (male)', pos: 'noun', gender: 'der', plural: 'Kollegen' },
    { de: 'Kollegin',   en: 'colleague (female)', pos: 'noun', gender: 'die', plural: 'Kolleginnen' },
    { de: 'Herr',       en: 'mister, gentleman', pos: 'noun', gender: 'der', plural: 'Herren' },
    { de: 'Samstag',    en: 'Saturday', pos: 'noun', gender: 'der' },
    { de: 'Montag',     en: 'Monday', pos: 'noun', gender: 'der' },
    { de: 'Uhr',        en: "clock, hour, o'clock", pos: 'noun', gender: 'die', plural: 'Uhren' },
    { de: 'Arbeitstag', en: 'workday', pos: 'noun', gender: 'der', plural: 'Arbeitstage' },
    { de: 'Deutsch',    en: 'German (the language)', pos: 'noun', gender: 'das', note: "'auf Deutsch' = in German." },
    // VERBS
    { de: 'heißen',     en: 'to be called, named', pos: 'verb', note: 'ich heiße, du heißt, er heißt.' },
    { de: 'wohnen',     en: 'to live, reside', pos: 'verb', note: 'Regular -en. ich wohne, du wohnst.' },
    { de: 'sein',       en: 'to be', pos: 'verb', note: 'Highly irregular. ich bin, du bist, er ist, wir sind, ihr seid, sie sind.' },
    { de: 'haben',      en: 'to have', pos: 'verb', note: 'Irregular. ich habe, du hast, er hat, wir haben.' },
    { de: 'machen',     en: 'to make, to do', pos: 'verb', note: 'Regular. ich mache, du machst.' },
    { de: 'trinken',    en: 'to drink', pos: 'verb', note: 'Regular. ich trinke, du trinkst.' },
    { de: 'essen',      en: 'to eat', pos: 'verb', note: 'Stem-changing: ich esse, du isst, er isst.' },
    { de: 'gehen',      en: 'to go, to walk', pos: 'verb', note: 'Regular. ich gehe, du gehst.' },
    { de: 'fahren',     en: 'to drive, travel', pos: 'verb', note: 'Stem-changing: ich fahre, du fährst, er fährt.' },
    { de: 'arbeiten',   en: 'to work', pos: 'verb', note: 'Adds -e- in some forms: du arbeitest, er arbeitet.' },
    { de: 'lesen',      en: 'to read', pos: 'verb', note: 'Stem-changing: ich lese, du liest, er liest.' },
    { de: 'möchten',    en: 'would like to', pos: 'verb', note: 'Modal. Sends the infinitive to the END.' },
    { de: 'können',     en: 'can, to be able to', pos: 'verb', note: 'Modal. ich kann, du kannst, er kann.' },
    { de: 'lernen',     en: 'to learn', pos: 'verb', note: 'Regular. ich lerne, du lernst.' },
    { de: 'anrufen',    en: 'to call (on the phone)', pos: 'verb', note: 'Separable: ich rufe ... an.' },
    { de: 'aufstehen',  en: 'to get up, stand up', pos: 'verb', note: 'Separable: ich stehe ... auf.' },
    { de: 'sehen',      en: 'to see', pos: 'verb', note: 'Stem-changing: ich sehe, du siehst, er sieht.' },
    { de: 'nehmen',     en: 'to take', pos: 'verb', note: 'Stem-changing: ich nehme, du nimmst, er nimmt.' },
    { de: 'sagen',      en: 'to say, to tell', pos: 'verb', note: 'Regular. ich sage, du sagst.' },
    { de: 'mögen',      en: 'to like', pos: 'verb', note: 'Modal-like. ich mag, du magst, er mag.' },
    { de: 'sitzen',     en: 'to sit', pos: 'verb', note: 'Strong verb. ich sitze, du sitzt.' },
    { de: 'schreiben',  en: 'to write', pos: 'verb', note: 'Regular. ich schreibe, du schreibst.' },
    { de: 'sprechen',   en: 'to speak, talk', pos: 'verb', note: 'Stem-changing: ich spreche, du sprichst, er spricht.' },
    { de: 'besuchen',   en: 'to visit', pos: 'verb', note: 'Regular. ich besuche, du besuchst.' },
    { de: 'bleiben',    en: 'to stay, remain', pos: 'verb', note: 'Regular present. ich bleibe, du bleibst.' },
    { de: 'kochen',     en: 'to cook', pos: 'verb', note: 'Regular. ich koche, du kochst.' },
    { de: 'hören',      en: 'to hear, to listen', pos: 'verb', note: 'Regular. ich höre, du hörst.' },
    { de: 'bringen',    en: 'to bring', pos: 'verb', note: 'Mixed verb. ich bringe, du bringst.' },
    { de: 'verstehen',  en: 'to understand', pos: 'verb', note: 'Inseparable prefix. ich verstehe, du verstehst.' },
    { de: 'einschlafen',en: 'to fall asleep', pos: 'verb', note: 'Separable: ich schlafe ... ein.' },
    { de: 'schlafen',   en: 'to sleep', pos: 'verb', note: 'Stem-changing: ich schlafe, du schläfst, er schläft.' },
    { de: 'kommen',     en: 'to come', pos: 'verb', note: 'Strong verb. ich komme, du kommst.' },
    // ADJECTIVES
    { de: 'gut',         en: 'good, well',                pos: 'adjective' },
    { de: 'schön',       en: 'beautiful, nice',           pos: 'adjective' },
    { de: 'groß',        en: 'big, large, tall',          pos: 'adjective' },
    { de: 'klein',       en: 'small, little',             pos: 'adjective' },
    { de: 'neu',         en: 'new',                       pos: 'adjective' },
    { de: 'alt',         en: 'old',                       pos: 'adjective' },
    { de: 'müde',        en: 'tired',                     pos: 'adjective' },
    { de: 'glücklich',   en: 'happy, lucky',              pos: 'adjective' },
    { de: 'lecker',      en: 'delicious, tasty',          pos: 'adjective' },
    { de: 'wichtig',     en: 'important',                 pos: 'adjective' },
    { de: 'nett',        en: 'nice, kind',                pos: 'adjective' },
    { de: 'heiß',        en: 'hot',                       pos: 'adjective' },
    { de: 'schwarz',     en: 'black',                     pos: 'adjective' },
    { de: 'frisch',      en: 'fresh',                     pos: 'adjective' },
    { de: 'blau',        en: 'blue',                      pos: 'adjective' },
    { de: 'weit',        en: 'far, wide',                 pos: 'adjective' },
    { de: 'interessant', en: 'interesting',               pos: 'adjective' },
    { de: 'schwer',      en: 'hard, difficult, heavy',    pos: 'adjective' },
    { de: 'streng',      en: 'strict, severe',            pos: 'adjective' },
    { de: 'fair',        en: 'fair',                      pos: 'adjective' },
    { de: 'jung',        en: 'young',                     pos: 'adjective' },
    { de: 'lustig',      en: 'funny, fun',                pos: 'adjective' },
    { de: 'ruhig',       en: 'calm, quiet',               pos: 'adjective' },
    { de: 'einfach',     en: 'easy, simple',              pos: 'adjective' },
    { de: 'schnell',     en: 'fast, quick',               pos: 'adjective' },
    { de: 'kalt',        en: 'cold',                      pos: 'adjective' },
    // ADVERBS
    { de: 'heute',       en: 'today',                     pos: 'adverb' },
    { de: 'morgen',      en: 'tomorrow',                  pos: 'adverb', note: "Lowercase = 'tomorrow'. Capitalized 'Morgen' = 'morning'." },
    { de: 'sehr',        en: 'very',                      pos: 'adverb' },
    { de: 'auch',        en: 'also, too',                 pos: 'adverb' },
    { de: 'langsam',     en: 'slowly, slow',              pos: 'adverb' },
    { de: 'nicht',       en: 'not',                       pos: 'adverb' },
    { de: 'manchmal',    en: 'sometimes',                 pos: 'adverb' },
    { de: 'viel',        en: 'a lot, much',               pos: 'adverb' },
    { de: 'hier',        en: 'here',                      pos: 'adverb' },
    { de: 'weiter',      en: 'further, on',               pos: 'adverb' },
    { de: 'gerne',       en: 'gladly, with pleasure',     pos: 'adverb' },
    { de: 'jeden',       en: 'every (acc. m.)',           pos: 'determiner', note: "'jeden Tag' = every day." },
    // NUMBERS + INTERJECTIONS
    { de: 'dreißig',     en: 'thirty',                    pos: 'number' },
    { de: 'sieben',      en: 'seven',                     pos: 'number' },
    { de: 'acht',        en: 'eight',                     pos: 'number' },
    { de: 'sechs',       en: 'six',                       pos: 'number' },
    { de: 'elf',         en: 'eleven',                    pos: 'number' },
    { de: 'zwölf',       en: 'twelve',                    pos: 'number' },
    { de: 'Hallo',       en: 'hello',                     pos: 'interjection' },
    { de: 'danke',       en: 'thanks, thank you',         pos: 'interjection' },
    { de: 'Ja',          en: 'yes',                       pos: 'interjection' }
  ],
  grammarRules: [
    {
      name: 'Verb-Second Position',
      tier: 1,
      desc: 'In main clauses the verb is always the 2nd element of the sentence, regardless of what comes first. If a time expression or other phrase comes first, the subject moves after the verb.',
      longExplanation: "Imagine the verb has a magnet. In a German main clause, the verb always sits in the second 'slot' — but a slot can hold more than one word. If you put a time word like 'Heute' (today) first, the verb still has to be slot 2, so the subject ('I') has to move to slot 3.",
      examples: [
        { de: 'Ich heiße Max.', en: 'My name is Max.', highlight: 'heiße' },
        { de: 'Heute trinke ich Kaffee.', en: 'Today I drink coffee.', highlight: 'trinke' },
        { de: 'Um acht Uhr fahre ich zur Arbeit.', en: "At eight o'clock I drive to work.", highlight: 'fahre' }
      ],
      tips: [
        "Slot 1 = whatever you put first (time, place, subject — doesn't matter).",
        'Slot 2 = always the conjugated verb. Always.',
        'Subordinate clauses (weil, dass) flip this — verb goes to the END instead.'
      ]
    },
    {
      name: 'Accusative Articles',
      tier: 1,
      desc: 'Masculine articles flip in the accusative: der to den, ein to einen, mein to meinen. Feminine, neuter, and plural do NOT change. Used for direct objects.',
      longExplanation: "When something is the 'object' of an action — what gets eaten, drunk, seen — German changes the masculine 'der/ein/mein' to 'den/einen/meinen'. Feminine, neuter, and plural articles don't change at all. So you only have to remember one column.",
      examples: [
        { de: 'Ich trinke den Kaffee.', en: 'I drink the coffee.', highlight: 'den' },
        { de: 'Ich sehe einen Mann.', en: 'I see a man.', highlight: 'einen' },
        { de: 'Ich esse eine Suppe.', en: 'I eat a soup.', highlight: 'eine' }
      ],
      tips: [
        'Only masculine articles change. Feminine (die/eine), neuter (das/ein), plural (die) stay the same.',
        'Pattern: r → n. der→den, ein→einen, mein→meinen, kein→keinen.'
      ],
      table: {
        title: 'Articles: Nominative vs Accusative',
        headers: ['Case', 'Masculine ★', 'Feminine', 'Neuter', 'Plural'],
        rows: [
          ['Nominative (subject)', 'der / ein / mein',     'die / eine / meine', 'das / ein / mein', 'die / — / meine'],
          ['Accusative (object)',  'den / einen / meinen', 'die / eine / meine', 'das / ein / mein', 'die / — / meine']
        ],
        note: '★ Only the masculine column changes. Memorize that one column.'
      }
    },
    {
      name: 'Possessives',
      tier: 1,
      desc: 'mein/meine/mein follow the gender and case of the noun they describe. They behave like ein-words.',
      longExplanation: 'Possessive words like mein (my), dein (your), sein (his) work exactly like the indefinite article ein. They take the same endings depending on what they describe — masculine, feminine, neuter, or plural — and change again in the accusative.',
      examples: [
        { de: 'Mein Buch ist neu.', en: 'My book is new.', highlight: 'Mein' },
        { de: 'Meine Schwester ist nett.', en: 'My sister is nice.', highlight: 'Meine' },
        { de: 'Ich liebe meinen Bruder.', en: 'I love my brother.', highlight: 'meinen' }
      ],
      tips: [
        "If you can use 'ein' there, you can use 'mein' there with the same ending.",
        'mein (m./n. nominative), meine (f./pl.), meinen (m. accusative).'
      ],
      table: {
        title: 'mein endings (same pattern for dein, sein, ihr, unser, euer, kein)',
        headers: ['Case', 'Masculine ★', 'Feminine', 'Neuter', 'Plural'],
        rows: [
          ['Nominative', 'mein',    'meine', 'mein', 'meine'],
          ['Accusative', 'meinen',  'meine', 'mein', 'meine']
        ],
        note: 'Same endings as ein-words. ★ Only masculine accusative adds -en.'
      }
    },
    {
      name: 'Separable Verbs',
      tier: 2,
      desc: 'Verbs like aufstehen, anrufen, einschlafen split when conjugated: the prefix goes to the END of the clause.',
      longExplanation: "Some German verbs have a prefix that splits off when you conjugate them. Think of the prefix as the verb's 'tail' — it falls off the verb and goes to the very end of the clause. The verb itself stays in slot 2 like normal.",
      examples: [
        { de: "Ich stehe um sieben Uhr auf.", en: "I get up at seven o'clock.", highlight: 'auf' },
        { de: 'Anna ruft mich an.', en: 'Anna calls me.', highlight: 'an' },
        { de: 'Ich schlafe schnell ein.', en: 'I fall asleep quickly.', highlight: 'ein' }
      ],
      tips: [
        'Common separable prefixes: auf-, an-, ein-, aus-, mit-, zu-, ab-, vor-.',
        'The prefix goes to the very END of the clause, not next to the verb.',
        'In dictionaries the verb is listed in its full form: aufstehen, anrufen, einschlafen.'
      ],
      table: {
        title: 'Common separable verbs',
        headers: ['Infinitive', 'Meaning', 'Conjugated (ich)'],
        rows: [
          ['aufstehen',   'to get up',          'ich stehe ... auf'],
          ['anrufen',     'to call (phone)',    'ich rufe ... an'],
          ['einschlafen', 'to fall asleep',     'ich schlafe ... ein'],
          ['ausgehen',    'to go out',          'ich gehe ... aus'],
          ['mitkommen',   'to come along',      'ich komme ... mit'],
          ['zumachen',    'to close (something)', 'ich mache ... zu']
        ],
        note: null
      }
    },
    {
      name: 'Modal Verbs',
      tier: 2,
      desc: 'Modal verbs (möchten, können, müssen, wollen, sollen, dürfen) send the main verb (infinitive) to the END of the clause.',
      longExplanation: 'Modal verbs — können (can), möchten (would like), müssen (must), wollen (want), sollen (should), dürfen (may) — describe HOW an action happens. The conjugated modal stays in slot 2, but the actual main verb shifts to the very end of the clause in its plain (infinitive) form.',
      examples: [
        { de: 'Ich kann viel lernen.', en: 'I can learn a lot.', highlight: 'lernen' },
        { de: 'Ich möchte ein Buch lesen.', en: 'I want to read a book.', highlight: 'lesen' },
        { de: 'Wir müssen jetzt gehen.', en: 'We have to go now.', highlight: 'gehen' }
      ],
      tips: [
        'Two verbs in the sentence? Modal in slot 2, infinitive at the END.',
        'Infinitive = unchanged dictionary form (lesen, gehen, lernen) — never conjugated when it follows a modal.'
      ],
      table: {
        title: 'Modal verbs — present tense conjugation',
        headers: ['', 'können (can)', 'müssen (must)', 'wollen (want)', 'möchten (would like)'],
        rows: [
          ['ich',       'kann',   'muss',   'will',   'möchte'],
          ['du',        'kannst', 'musst',  'willst', 'möchtest'],
          ['er/sie/es', 'kann',   'muss',   'will',   'möchte'],
          ['wir',       'können', 'müssen', 'wollen', 'möchten'],
          ['ihr',       'könnt',  'müsst',  'wollt',  'möchtet'],
          ['sie/Sie',   'können', 'müssen', 'wollen', 'möchten']
        ],
        note: 'Notice ich and er/sie/es share the same form — that is a hallmark of modal verbs.'
      }
    },
    {
      name: 'Subordinate Clauses with weil',
      tier: 3,
      desc: 'The conjunction weil (because) sends the conjugated verb to the END of its clause. Comma always required before weil.',
      longExplanation: "The word 'weil' (because) starts a subordinate clause — a clause that depends on a main clause. Subordinate clauses follow a different rule from main clauses: the conjugated verb has to go all the way to the END of the clause. And don't forget the comma before 'weil'.",
      examples: [
        { de: 'Ich bleibe zu Hause, weil ich müde bin.', en: 'I stay home because I am tired.', highlight: 'bin' },
        { de: 'Er trinkt Kaffee, weil das Wetter kalt ist.', en: 'He drinks coffee because the weather is cold.', highlight: 'ist' },
        { de: 'Ich nehme das Fahrrad, weil das Wetter gut ist.', en: 'I take the bicycle because the weather is good.', highlight: 'ist' }
      ],
      tips: [
        'weil → comma, then verb at the END.',
        'Other subordinating conjunctions work the same way: dass (that), wenn (if/when), ob (whether), obwohl (although).',
        "The MAIN clause keeps verb-2. Only the 'weil' clause flips."
      ]
    },
    {
      name: 'Dative Prepositions',
      tier: 3,
      desc: 'The prepositions mit, zu, von, bei, nach, aus always take dative case. Watch for contractions: zu+dem=zum, zu+der=zur, von+dem=vom.',
      longExplanation: "Six prepositions ALWAYS take the dative case: mit (with), zu (to), von (from), bei (at/near), nach (after/to), aus (out of). When you use one, the noun's article shifts — der → dem, die → der, das → dem, plural → den (and the noun adds -n if it isn't already plural). Memorize these six and you're set.",
      examples: [
        { de: 'Ich gehe mit meinem Freund.', en: 'I go with my friend.', highlight: 'meinem' },
        { de: 'Ich fahre zur Arbeit.', en: 'I drive to work.', highlight: 'zur' },
        { de: 'Sie kommt aus dem Haus.', en: 'She comes out of the house.', highlight: 'dem' }
      ],
      tips: [
        'Memorize the six: mit, zu, von, bei, nach, aus.',
        'Common contractions: zu+dem=zum, zu+der=zur, von+dem=vom, bei+dem=beim.',
        'Dative endings: m → dem, f → der, n → dem, pl → den (+ -n on the noun if not already plural).'
      ],
      table: {
        title: 'Dative endings + common contractions',
        headers: ['', 'Masculine', 'Feminine', 'Neuter', 'Plural'],
        rows: [
          ['Article',        'dem',     'der',     'dem',     'den + -n'],
          ['mein',           'meinem',  'meiner',  'meinem',  'meinen'],
          ['zu + article',   'zum',     'zur',     'zum',     'zu den'],
          ['von + article',  'vom',     'von der', 'vom',     'von den'],
          ['bei + article',  'beim',    'bei der', 'beim',    'bei den']
        ],
        note: 'Plural nouns also get -n added (mit den Kindern, with the children).'
      }
    }
  ],
  grammarTests: [
    { tier: 1, rule: 'Verb-Second Position', en: 'Today I drink coffee.', de: 'Heute trinke ich Kaffee.', trap: null },
    { tier: 1, rule: 'Verb-Second Position', en: 'At seven o\'clock I get up.', de: 'Um sieben Uhr stehe ich auf.', trap: null },
    { tier: 1, rule: 'Accusative Articles', en: 'I see the boss.', de: 'Ich sehe den Chef.', trap: null },
    { tier: 1, rule: 'Accusative Articles', en: 'I drink the water.', de: 'Ich trinke das Wasser.', trap: 'das stays das (neuter doesn\'t change in accusative).' },
    { tier: 1, rule: 'Possessives', en: 'My sister is nice.', de: 'Meine Schwester ist nett.', trap: null },
    { tier: 1, rule: 'Possessives', en: 'My book is new.', de: 'Mein Buch ist neu.', trap: null },
    { tier: 2, rule: 'Separable Verbs', en: 'I call Anna.', de: 'Ich rufe Anna an.', trap: null },
    { tier: 2, rule: 'Separable Verbs', en: 'She gets up at eight.', de: 'Sie steht um acht auf.', trap: null },
    { tier: 2, rule: 'Modal Verbs', en: 'I want to drink coffee.', de: 'Ich möchte Kaffee trinken.', trap: null },
    { tier: 2, rule: 'Modal Verbs', en: 'I can read the book.', de: 'Ich kann das Buch lesen.', trap: null },
    { tier: 3, rule: 'Subordinate Clauses with weil', en: 'I am happy because the weather is good.', de: 'Ich bin glücklich, weil das Wetter gut ist.', trap: null },
    { tier: 3, rule: 'Subordinate Clauses with weil', en: 'I drink coffee because I am tired.', de: 'Ich trinke Kaffee, weil ich müde bin.', trap: '\'bin\' goes to the END after weil.' },
    { tier: 3, rule: 'Dative Prepositions', en: 'I work with my colleague.', de: 'Ich arbeite mit meiner Kollegin.', trap: null },
    { tier: 3, rule: 'Dative Prepositions', en: 'I drive to the work.', de: 'Ich fahre zur Arbeit.', trap: 'zu + der → zur (contraction).' }
  ]
};

/* ------------------------------------------------------------
   BUILT-IN STORY for Italian — same schema as German story-1.
   Mirror of `example-italian-story.json` but embedded so it
   always ships with the app (works offline + on file:// origins
   where fetch is blocked + on hosted GitHub Pages alike).
   ------------------------------------------------------------ */
/* ============================================================
   BUILT-IN STORY: Il gruppo (it-a1-s01) — Bianca's A1 chapter 1.
   Authoritative source: it-a1-s01.json (mirrored on disk so the
   story can be re-imported via Settings → Stories). Embedded
   here in the internal legacy shape so the app loads it without
   running through the schema adapter.
   ============================================================ */
const BUILTIN_STORY_IL_GRUPPO = {
      "schemaVersion": 1,
      "languageId": "it",
      "id": "it-a1-s01",
      "_storyVersion": 2,
      "title": "Il gruppo",
      "level": "A1",
      "order": 1,
      "synopsis": "On a grey September Tuesday in Varenna, ten-year-old {{PROTAGONIST}} is left out when her classmates form groups for a project. She pretends not to mind, walks home along the lake, and draws what she sees instead of saying what she feels.",
      "_atmosphereIntro": null,
      "_coverPrompt": null,
      "coverImage": "images/it/it-a1-s01/cover.jpg",
      "sentences": [
            {
                  "de": "È martedì mattina.",
                  "en": "It is Tuesday morning.",
                  "note": "Essere 3sg for time. Martedì is masculine."
            },
            {
                  "de": "È fine settembre a Varenna.",
                  "en": "It is late September in Varenna.",
                  "note": "Settembre: masculine. Place name exempt from vocab pool."
            },
            {
                  "de": "L'aria è fredda.",
                  "en": "The air is cold.",
                  "note": "L' = elided la (feminine, before vowel). Adjective fredda agrees feminine (a1-g-02, a1-g-07)."
            },
            {
                  "de": "{{PROTAGONIST}} è in classe.",
                  "en": "{{PROTAGONIST}} is in class.",
                  "note": "La classe is feminine (a1-g-02)."
            },
            {
                  "de": "Lei ha dieci anni.",
                  "en": "She is ten years old.",
                  "note": "Overt subject pronoun lei (a1-g-01). Italian uses avere for age (a1-g-06)."
            },
            {
                  "de": "È una bambina piccola e tranquilla.",
                  "en": "She is a small and quiet girl.",
                  "note": "Una bambina: feminine indefinite (a1-g-04). Adjectives piccola, tranquilla agree feminine (a1-g-02, a1-g-07)."
            },
            {
                  "de": "Il banco è di legno.",
                  "en": "The desk is wooden.",
                  "note": "Il banco: masculine definite (a1-g-05)."
            },
            {
                  "de": "La finestra guarda il lago.",
                  "en": "The window looks at the lake.",
                  "note": "La finestra: feminine. Il lago: masculine (a1-g-02)."
            },
            {
                  "de": "L'acqua è grigia.",
                  "en": "The water is grey.",
                  "note": "L' = elided la. Adjective grigia agrees feminine."
            },
            {
                  "de": "La maestra entra.",
                  "en": "The teacher comes in.",
                  "note": "La maestra: feminine."
            },
            {
                  "de": "Lei ha un libro in mano.",
                  "en": "She has a book in her hand.",
                  "note": "Lei overt for emphasis (a1-g-01). Un libro: masc. La mano: irregular feminine."
            },
            {
                  "de": "I bambini sono pronti.",
                  "en": "The children are ready.",
                  "note": "I bambini: masc plural definite (a1-g-03, a1-g-05). Pronti agrees masc plural."
            },
            {
                  "de": "«Oggi facciamo un lavoro di gruppo,» dice la maestra.",
                  "en": "\"Today we do a group project,\" says the teacher.",
                  "note": "Noi facciamo: 1pl, fare (a1-g-09). Un lavoro: masc indefinite."
            },
            {
                  "de": "«Tre bambini per gruppo.»",
                  "en": "\"Three children per group.\"",
                  "note": "Tre: indeclinable number."
            },
            {
                  "de": "«Scegliete voi.»",
                  "en": "\"You choose.\"",
                  "note": "Voi overt subject pronoun for emphasis (a1-g-01). Receptive imperative — used here as fixed teacher-talk."
            },
            {
                  "de": "{{PROTAGONIST}} non parla.",
                  "en": "{{PROTAGONIST}} doesn't speak.",
                  "note": "Negation with non (a1-g-10)."
            },
            {
                  "de": "Lei guarda il banco.",
                  "en": "She looks at the desk.",
                  "note": "Lei overt (a1-g-01)."
            },
            {
                  "de": "I bambini si alzano.",
                  "en": "The children get up.",
                  "note": "Si alzano: receptive — alzarsi reflexive used as fixed expression. Flagged."
            },
            {
                  "de": "Le sedie fanno rumore.",
                  "en": "The chairs make noise.",
                  "note": "Le sedie: feminine plural (a1-g-03, a1-g-05). Fare 3pl (a1-g-09)."
            },
            {
                  "de": "Giulia è già con due amiche.",
                  "en": "Giulia is already with two friends.",
                  "note": "Giulia: hardcoded character. Due amiche: feminine plural."
            },
            {
                  "de": "Loro ridono.",
                  "en": "They are laughing.",
                  "note": "Overt loro (a1-g-01). Ridere as receptive verb at A1, used contextually."
            },
            {
                  "de": "Loro non guardano {{PROTAGONIST}}.",
                  "en": "They don't look at {{PROTAGONIST}}.",
                  "note": "Negation. Loro overt for contrast with the protagonist (a1-g-01)."
            },
            {
                  "de": "Giulia guarda {{PROTAGONIST}}.",
                  "en": "Giulia looks at {{PROTAGONIST}}.",
                  "note": "Subject elsewhere; verb 3sg."
            },
            {
                  "de": "Lei alza una mano.",
                  "en": "She raises a hand.",
                  "note": "Una mano: feminine (irregular). Lei overt (a1-g-01)."
            },
            {
                  "de": "Poi lei parla con le altre.",
                  "en": "Then she speaks with the others.",
                  "note": "Le altre: feminine plural. Lei overt continues subject contrast."
            },
            {
                  "de": "{{PROTAGONIST}} non si muove.",
                  "en": "{{PROTAGONIST}} doesn't move.",
                  "note": "Si muove: receptive reflexive (muoversi). Used as fixed expression at A1."
            },
            {
                  "de": "La maestra guarda la classe.",
                  "en": "The teacher looks at the class.",
                  "note": "Two feminine nouns; both with definite article."
            },
            {
                  "de": "Ci sono tre gruppi di tre.",
                  "en": "There are three groups of three.",
                  "note": "Ci sono: existential. Gruppi masc plural."
            },
            {
                  "de": "E c'è {{PROTAGONIST}}, da sola.",
                  "en": "And there is {{PROTAGONIST}}, alone.",
                  "note": "C'è: 3sg existential. Da sola: adjective sola agrees feminine (a1-g-07)."
            },
            {
                  "de": "«{{PROTAGONIST}}, vai con loro,» dice la maestra.",
                  "en": "\"{{PROTAGONIST}}, go with them,\" says the teacher.",
                  "note": "Vai: receptive imperative (andare 2sg) — fixed teacher-talk. Loro overt object-of-preposition."
            },
            {
                  "de": "«Quattro va bene.»",
                  "en": "\"Four is fine.\"",
                  "note": "Va bene: fixed expression."
            },
            {
                  "de": "{{PROTAGONIST}} dice: «Va bene.»",
                  "en": "{{PROTAGONIST}} says: \"Okay.\"",
                  "note": "Same fixed expression, echoed back."
            },
            {
                  "de": "Le tre bambine non parlano.",
                  "en": "The three girls don't speak.",
                  "note": "Le bambine: feminine plural definite. Negation."
            },
            {
                  "de": "Lavorano insieme.",
                  "en": "They work together.",
                  "note": "Subject dropped (default). Verb 3pl (a1-g-08)."
            },
            {
                  "de": "{{PROTAGONIST}} guarda.",
                  "en": "{{PROTAGONIST}} watches.",
                  "note": "Verb of perception. Subject named."
            },
            {
                  "de": "Lei prende un foglio.",
                  "en": "She takes a sheet of paper.",
                  "note": "Lei overt (a1-g-01). Un foglio: masc (a1-g-04)."
            },
            {
                  "de": "Il foglio è bianco.",
                  "en": "The sheet is white.",
                  "note": "Il foglio masc, bianco agrees masc."
            },
            {
                  "de": "Lei ha una matita.",
                  "en": "She has a pencil.",
                  "note": "Una matita: feminine. Avere (a1-g-06)."
            },
            {
                  "de": "La matita è di Nonna.",
                  "en": "The pencil is from Nonna.",
                  "note": "Nonna: hardcoded character (Nonna Elsa, named here only as Nonna)."
            },
            {
                  "de": "Lei scrive un nome.",
                  "en": "She writes a name.",
                  "note": "Un nome: masculine (-e ending)."
            },
            {
                  "de": "Suona la campanella.",
                  "en": "The bell rings.",
                  "note": "Subject inversion: la campanella feminine. Suonare receptive use."
            },
            {
                  "de": "I bambini escono.",
                  "en": "The children go out.",
                  "note": "Uscire: irregular (a1-g-09)."
            },
            {
                  "de": "{{PROTAGONIST}} esce per ultima.",
                  "en": "{{PROTAGONIST}} goes out last.",
                  "note": "Per ultima: feminine agreement (ultima)."
            },
            {
                  "de": "Il sole è basso.",
                  "en": "The sun is low.",
                  "note": "Il sole: masculine (-e ending). Basso agrees masc."
            },
            {
                  "de": "Il cortile è grande.",
                  "en": "The schoolyard is big.",
                  "note": "Il cortile: masculine. Grande invariable."
            },
            {
                  "de": "{{PROTAGONIST}} sta vicino al muro.",
                  "en": "{{PROTAGONIST}} stands near the wall.",
                  "note": "Stare (a1-g-09). Al muro: a + il = al."
            },
            {
                  "de": "Lei ha il quaderno in mano.",
                  "en": "She has the notebook in her hand.",
                  "note": "Il quaderno: masculine. Lei overt (a1-g-01)."
            },
            {
                  "de": "Lei apre il quaderno.",
                  "en": "She opens the notebook.",
                  "note": "Aprire (a1-g-08, -ire verb)."
            },
            {
                  "de": "Disegna un albero.",
                  "en": "She draws a tree.",
                  "note": "Subject dropped. Un albero: masculine. Disegnare regular -are (a1-g-08)."
            },
            {
                  "de": "Disegna anche una donna.",
                  "en": "She also draws a woman.",
                  "note": "Una donna: feminine. Anche."
            },
            {
                  "de": "Giulia chiama: «{{PROTAGONIST}}, vieni?»",
                  "en": "Giulia calls: \"{{PROTAGONIST}}, are you coming?\"",
                  "note": "Vieni: venire 2sg (a1-g-09). Question form (a1-g-11)."
            },
            {
                  "de": "Le altre bambine giocano già.",
                  "en": "The other girls are already playing.",
                  "note": "Giocare regular -are. Le altre: feminine plural."
            },
            {
                  "de": "{{PROTAGONIST}} guarda Giulia.",
                  "en": "{{PROTAGONIST}} looks at Giulia.",
                  "note": ""
            },
            {
                  "de": "Lei guarda anche le altre.",
                  "en": "She also looks at the others.",
                  "note": "Lei overt (a1-g-01). Le altre feminine plural."
            },
            {
                  "de": "«No, grazie,» dice {{PROTAGONIST}}.",
                  "en": "\"No, thanks,\" says {{PROTAGONIST}}.",
                  "note": "Polite refusal. Fixed."
            },
            {
                  "de": "Giulia non insiste.",
                  "en": "Giulia doesn't insist.",
                  "note": "Negation."
            },
            {
                  "de": "Il pomeriggio è grigio.",
                  "en": "The afternoon is grey.",
                  "note": "Il pomeriggio: masculine. Grigio agrees masc."
            },
            {
                  "de": "{{PROTAGONIST}} esce dalla scuola.",
                  "en": "{{PROTAGONIST}} leaves school.",
                  "note": "Dalla = da + la. La scuola: feminine."
            },
            {
                  "de": "Cammina piano verso casa.",
                  "en": "She walks slowly toward home.",
                  "note": "Subject dropped. Verso casa: 'home' as destination, common bare-noun use."
            },
            {
                  "de": "La strada scende verso il lago.",
                  "en": "The road goes down to the lake.",
                  "note": "La strada: feminine. Scendere regular -ere (a1-g-08). Il lago: masc."
            },
            {
                  "de": "Le pietre sono bagnate.",
                  "en": "The stones are wet.",
                  "note": "Le pietre: feminine plural. Bagnate agrees fem plural (a1-g-07)."
            },
            {
                  "de": "L'acqua del lago è ferma.",
                  "en": "The water of the lake is still.",
                  "note": "L' = elided la. Del = di + il. Ferma agrees feminine."
            },
            {
                  "de": "{{PROTAGONIST}} non pensa alla scuola.",
                  "en": "{{PROTAGONIST}} doesn't think about school.",
                  "note": "Pensare regular -are. Alla scuola: a + la."
            },
            {
                  "de": "Lei pensa al disegno e al lago.",
                  "en": "She thinks about the drawing and the lake.",
                  "note": "Lei overt (a1-g-01). Al = a + il. Combines two prior thoughts into one sentence."
            },
            {
                  "de": "La casa è piccola.",
                  "en": "The house is small.",
                  "note": "La casa: feminine."
            },
            {
                  "de": "Mamma è sulla porta.",
                  "en": "Mamma is at the door.",
                  "note": "Mamma: hardcoded. Sulla = su + la. La porta: feminine."
            },
            {
                  "de": "Lei ha il telefono in mano.",
                  "en": "She has the phone in her hand.",
                  "note": "Lei (Mamma) overt for clarity (a1-g-01). Il telefono: masc."
            },
            {
                  "de": "«Com'è andata a scuola?» chiede Mamma.",
                  "en": "\"How did it go at school?\" Mamma asks.",
                  "note": "Receptive idiom — fixed greeting. A scuola: bare destination. Chiedere -ere."
            },
            {
                  "de": "{{PROTAGONIST}} dice: «Bene.»",
                  "en": "{{PROTAGONIST}} says: \"Fine.\"",
                  "note": "Bene: adverb."
            },
            {
                  "de": "Mamma sorride e torna in casa.",
                  "en": "Mamma smiles and goes back inside.",
                  "note": "Sorridere -ere. Tornare regular -are. Tornare in casa = go back inside."
            },
            {
                  "de": "{{PROTAGONIST}} entra in camera.",
                  "en": "{{PROTAGONIST}} goes into her room.",
                  "note": "Entrare regular -are. La camera: feminine."
            },
            {
                  "de": "Chiude la porta.",
                  "en": "She closes the door.",
                  "note": "Chiudere -ere. Subject dropped."
            },
            {
                  "de": "La camera è piccola e tranquilla.",
                  "en": "The room is small and quiet.",
                  "note": "Repeats camera; demonstrates feminine adjective agreement (a1-g-07)."
            },
            {
                  "de": "Apre il quaderno a una pagina nuova.",
                  "en": "She opens the notebook to a new page.",
                  "note": "Una pagina: feminine. Nuova agrees feminine (a1-g-07)."
            },
            {
                  "de": "Prende la matita di Nonna.",
                  "en": "She takes Nonna's pencil.",
                  "note": "Repeats matita; di Nonna shows possession with di."
            },
            {
                  "de": "Lei non disegna il cortile.",
                  "en": "She doesn't draw the schoolyard.",
                  "note": "Lei overt for emphasis (a1-g-01). Negation."
            },
            {
                  "de": "Disegna il lago.",
                  "en": "She draws the lake.",
                  "note": "Subject dropped. Il lago: masc."
            },
            {
                  "de": "La matita è leggera nella mano.",
                  "en": "The pencil is light in her hand.",
                  "note": "Matita third exposure. Nella = in + la."
            },
            {
                  "de": "Fuori, Mamma parla ancora al telefono.",
                  "en": "Outside, Mamma is still talking on the phone.",
                  "note": "Fuori: adverb."
            },
            {
                  "de": "In camera c'è solo la matita.",
                  "en": "In the room there is only the pencil.",
                  "note": "C'è: 3sg existential. Solo: adverb. Closing image with camera + matita."
            }
      ],
      "vocabulary": [
            {
                  "de": "essere",
                  "en": "to be",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "avere",
                  "en": "to have",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "il",
                  "en": "the (m. sg.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "la",
                  "en": "the (f. sg.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "i",
                  "en": "the (m. pl.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "le",
                  "en": "the (f. pl.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "un",
                  "en": "a, one (m.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "una",
                  "en": "a, one (f.)",
                  "pos": "article",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "io",
                  "en": "I",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "tu",
                  "en": "you (sg.)",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "lei",
                  "en": "she",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "lui",
                  "en": "he",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "noi",
                  "en": "we",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "voi",
                  "en": "you (pl.)",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "loro",
                  "en": "they",
                  "pos": "pronoun",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "non",
                  "en": "not",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "e",
                  "en": "and",
                  "pos": "conjunction",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "ma",
                  "en": "but",
                  "pos": "conjunction",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "sì",
                  "en": "yes",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "no",
                  "en": "no",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "anche",
                  "en": "also, too",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "già",
                  "en": "already",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "poi",
                  "en": "then",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "ancora",
                  "en": "still, again",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "oggi",
                  "en": "today",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "ora",
                  "en": "now",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "fuori",
                  "en": "outside",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "vicino",
                  "en": "near",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "insieme",
                  "en": "together",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "piano",
                  "en": "slowly, quietly",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "bene",
                  "en": "well, fine",
                  "pos": "adverb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "grazie",
                  "en": "thanks",
                  "pos": "interjection",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "tre",
                  "en": "three",
                  "pos": "number",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "dieci",
                  "en": "ten",
                  "pos": "number",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "due",
                  "en": "two",
                  "pos": "number",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "quattro",
                  "en": "four",
                  "pos": "number",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "scuola",
                  "en": "school",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "classe",
                  "en": "class, classroom",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "maestra",
                  "en": "teacher (f.)",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "bambina",
                  "en": "girl, child (f.)",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "bambino",
                  "en": "boy, child (m.)",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "amica",
                  "en": "friend (f.)",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "gruppo",
                  "en": "group",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "lavoro",
                  "en": "work, project",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "banco",
                  "en": "school desk",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "libro",
                  "en": "book",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "quaderno",
                  "en": "notebook",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "matita",
                  "en": "pencil",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "foglio",
                  "en": "sheet (of paper)",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "pagina",
                  "en": "page",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "nome",
                  "en": "name",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "finestra",
                  "en": "window",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "porta",
                  "en": "door",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "casa",
                  "en": "house, home",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "camera",
                  "en": "(bed)room",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "muro",
                  "en": "wall",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "cortile",
                  "en": "schoolyard, courtyard",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "strada",
                  "en": "road, street",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "pietra",
                  "en": "stone",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "lago",
                  "en": "lake",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "acqua",
                  "en": "water",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "sole",
                  "en": "sun",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "aria",
                  "en": "air",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "albero",
                  "en": "tree",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "donna",
                  "en": "woman",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "mano",
                  "en": "hand",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "telefono",
                  "en": "phone",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "campanella",
                  "en": "(school) bell",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "sedia",
                  "en": "chair",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "rumore",
                  "en": "noise",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "disegno",
                  "en": "drawing",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "mattina",
                  "en": "morning",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "pomeriggio",
                  "en": "afternoon",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "settembre",
                  "en": "September",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "martedì",
                  "en": "Tuesday",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "anno",
                  "en": "year",
                  "pos": "noun",
                  "gender": "m",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "mamma",
                  "en": "mum, mother",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "nonna",
                  "en": "grandmother",
                  "pos": "noun",
                  "gender": "f",
                  "plural": null,
                  "note": null
            },
            {
                  "de": "piccolo",
                  "en": "small",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "grande",
                  "en": "big",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "tranquillo",
                  "en": "quiet, calm",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "freddo",
                  "en": "cold",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "grigio",
                  "en": "grey",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "bianco",
                  "en": "white",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "basso",
                  "en": "low",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "fermo",
                  "en": "still, motionless",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "bagnato",
                  "en": "wet",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "pronto",
                  "en": "ready",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "nuovo",
                  "en": "new",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "altro",
                  "en": "other",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "ultimo",
                  "en": "last",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "solo",
                  "en": "alone, only",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "leggero",
                  "en": "light (in weight)",
                  "pos": "adjective",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "parlare",
                  "en": "to speak",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "dire",
                  "en": "to say",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "guardare",
                  "en": "to look (at)",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "vedere",
                  "en": "to see",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "fare",
                  "en": "to do, to make",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "andare",
                  "en": "to go",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "venire",
                  "en": "to come",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "tornare",
                  "en": "to go back",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "entrare",
                  "en": "to enter",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "uscire",
                  "en": "to go out",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "stare",
                  "en": "to stay, to be (state)",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "scendere",
                  "en": "to go down",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "camminare",
                  "en": "to walk",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "prendere",
                  "en": "to take",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "aprire",
                  "en": "to open",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "chiudere",
                  "en": "to close",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "scrivere",
                  "en": "to write",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "disegnare",
                  "en": "to draw",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "pensare",
                  "en": "to think",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "chiamare",
                  "en": "to call",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "chiedere",
                  "en": "to ask",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "giocare",
                  "en": "to play",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "sorridere",
                  "en": "to smile",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "ridere",
                  "en": "to laugh",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "suonare",
                  "en": "to ring, to sound",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "lavorare",
                  "en": "to work",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "alzare",
                  "en": "to raise, to lift",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "insistere",
                  "en": "to insist",
                  "pos": "verb",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "di",
                  "en": "of, from",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "a",
                  "en": "to, at",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "in",
                  "en": "in",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "con",
                  "en": "with",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "per",
                  "en": "for",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "su",
                  "en": "on",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "verso",
                  "en": "toward",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            },
            {
                  "de": "da",
                  "en": "from, by",
                  "pos": "preposition",
                  "gender": null,
                  "plural": null,
                  "note": null
            }
      ],
      "grammarRules": [
            {
                  "name": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "tier": 1,
                  "desc": "Italian has subject pronouns (io, tu, lui, lei, noi, voi, loro) but usually drops them — the verb ending is enough. The pronouns appear when you want to emphasize or contrast a subject. In this story, lei (she) and loro (they) appear at every key emotional moment: lei for {{PROTAGONIST}} alone with her thoughts, loro for the group she is not in.",
                  "longExplanation": "Italian has subject pronouns — io, tu, lui, lei, noi, voi, loro — but it usually drops them, because the verb ending already tells you who's doing the action. You'll mostly see them when the speaker wants to emphasize a person or contrast two subjects. Notice how 'lei' and 'loro' carry the emotional weight of this chapter: 'lei' picks out {{PROTAGONIST}} alone, 'loro' the group she's not in.",
                  "_id": "a1-g-01",
                  "_status": "new",
                  "examples": [
                        {
                              "de": "Lei ha dieci anni.",
                              "en": "She is ten years old.",
                              "highlight": "Lei"
                        },
                        {
                              "de": "Loro ridono.",
                              "en": "They laugh.",
                              "highlight": "Loro"
                        },
                        {
                              "de": "Io sono Bianca.",
                              "en": "I am Bianca.",
                              "highlight": "Io"
                        }
                  ],
                  "tips": [
                        "Italian usually drops the pronoun — the verb ending tells you who.",
                        "Use the pronoun only for emphasis or contrast.",
                        "'lui' = he, 'lei' = she; both can also mean polite 'you' (introduced later)."
                  ],
                  "table": {
                        "title": "Subject pronouns",
                        "headers": [
                              "Person",
                              "Pronoun"
                        ],
                        "rows": [
                              [
                                    "1st sing.",
                                    "io (I)"
                              ],
                              [
                                    "2nd sing.",
                                    "tu (you, informal)"
                              ],
                              [
                                    "3rd sing. m",
                                    "lui (he)"
                              ],
                              [
                                    "3rd sing. f",
                                    "lei (she)"
                              ],
                              [
                                    "1st plur.",
                                    "noi (we)"
                              ],
                              [
                                    "2nd plur.",
                                    "voi (you all)"
                              ],
                              [
                                    "3rd plur.",
                                    "loro (they)"
                              ]
                        ]
                  }
            },
            {
                  "name": "Noun gender (masculine / feminine)",
                  "tier": 1,
                  "desc": "Every Italian noun is masculine or feminine. Most nouns ending in -o are masculine (il libro, il banco, il lago); most ending in -a are feminine (la casa, la matita, la bambina). Nouns ending in -e can be either (il sole — m.; la classe — f.) and must be learned individually. The article and any adjective always agree with the noun's gender.",
                  "longExplanation": "Every Italian noun is either masculine or feminine — there's no neutral. Most nouns ending in -o are masculine (il libro, il banco, il lago); most ending in -a are feminine (la casa, la matita, la bambina). Nouns ending in -e go either way (il sole is masculine; la classe is feminine) and have to be learned one by one. The article and any adjective in the sentence MUST agree with the noun's gender.",
                  "_id": "a1-g-02",
                  "_status": "new",
                  "examples": [
                        {
                              "de": "L'aria è fredda.",
                              "en": "The air is cold.",
                              "highlight": "aria"
                        },
                        {
                              "de": "il lago",
                              "en": "the lake",
                              "highlight": "lago"
                        },
                        {
                              "de": "la matita",
                              "en": "the pencil",
                              "highlight": "matita"
                        }
                  ],
                  "tips": [
                        "Most -o nouns are masculine; most -a nouns are feminine.",
                        "-e nouns can be either gender — memorize each one's gender with the article.",
                        "When in doubt, learn the noun together with its definite article (il / la)."
                  ],
                  "table": {
                        "title": "Typical gender endings",
                        "headers": [
                              "Ending",
                              "Usually",
                              "Examples"
                        ],
                        "rows": [
                              [
                                    "-o",
                                    "masculine",
                                    "libro, banco, lago"
                              ],
                              [
                                    "-a",
                                    "feminine",
                                    "casa, matita, aria"
                              ],
                              [
                                    "-e",
                                    "either",
                                    "sole (m) · classe (f)"
                              ]
                        ]
                  }
            },
            {
                  "name": "Noun number (singular/plural)",
                  "tier": 2,
                  "desc": "Singulars in -o → plural -i (libro → libri). Singulars in -a → plural -e (matita → matite). Singulars in -e → plural -i (nome → nomi).",
                  "longExplanation": "Italian nouns change ending to mark plural. The pattern depends on the singular ending: masculine -o becomes -i (libro → libri), feminine -a becomes -e (matita → matite), and both-gender -e becomes -i (nome → nomi, classe → classi). The article and adjective shift to plural too: il libro → i libri, la matita → le matite.",
                  "_id": "a1-g-03",
                  "_status": "supporting",
                  "examples": [
                        {
                              "de": "i bambini",
                              "en": "the children",
                              "highlight": "bambini"
                        },
                        {
                              "de": "le pietre",
                              "en": "the stones",
                              "highlight": "pietre"
                        },
                        {
                              "de": "le classi",
                              "en": "the classes",
                              "highlight": "classi"
                        }
                  ],
                  "tips": [
                        "Masculine -o → -i.",
                        "Feminine -a → -e.",
                        "-e nouns (either gender) → -i.",
                        "The whole phrase shifts: la matita rossa → le matite rosse."
                  ],
                  "table": {
                        "title": "Plural endings",
                        "headers": [
                              "Singular",
                              "Plural",
                              "Example"
                        ],
                        "rows": [
                              [
                                    "-o (m)",
                                    "-i",
                                    "libro → libri"
                              ],
                              [
                                    "-a (f)",
                                    "-e",
                                    "matita → matite"
                              ],
                              [
                                    "-e (m/f)",
                                    "-i",
                                    "nome → nomi · classe → classi"
                              ]
                        ]
                  }
            },
            {
                  "name": "Indefinite articles (un, una, un')",
                  "tier": 2,
                  "desc": "Un before most masculine nouns; una before feminine consonant-initial nouns; un' before feminine vowel-initial nouns (un'amica).",
                  "longExplanation": "Indefinite articles (the equivalents of English 'a' / 'an') agree with the noun's gender and the next sound. Use 'un' before any masculine noun. Use 'una' before a feminine noun starting with a consonant. Use 'un'' (with apostrophe, no space) before a feminine noun starting with a vowel. Note: 'un amico' has no apostrophe — masculine 'un' never elides.",
                  "_id": "a1-g-04",
                  "_status": "supporting",
                  "examples": [
                        {
                              "de": "una bambina piccola",
                              "en": "a small girl",
                              "highlight": "una"
                        },
                        {
                              "de": "un libro",
                              "en": "a book",
                              "highlight": "un"
                        },
                        {
                              "de": "un'amica",
                              "en": "a (female) friend",
                              "highlight": "un'"
                        }
                  ],
                  "tips": [
                        "'un' before masculine nouns — no apostrophe even before vowels.",
                        "'una' before feminine nouns starting with a consonant.",
                        "'un'' (apostrophe) before feminine nouns starting with a vowel."
                  ],
                  "table": {
                        "title": "Indefinite articles",
                        "headers": [
                              "Form",
                              "Use",
                              "Example"
                        ],
                        "rows": [
                              [
                                    "un",
                                    "masculine (any sound)",
                                    "un libro · un amico"
                              ],
                              [
                                    "una",
                                    "feminine + consonant",
                                    "una matita · una bambina"
                              ],
                              [
                                    "un'",
                                    "feminine + vowel",
                                    "un'amica · un'ora"
                              ]
                        ]
                  }
            },
            {
                  "name": "Definite articles (il, la, l', i, le)",
                  "tier": 2,
                  "desc": "Il / la for singular before consonants; l' before vowels; i / le for plural. Lo / gli (before s+cons., z) are introduced more fully in later stories.",
                  "longExplanation": "Definite articles (the equivalents of English 'the') change with gender, number, and the sound that follows. In this story you'll meet four forms: 'il' / 'la' for singular nouns starting with a consonant, 'l'' for singular nouns starting with a vowel (both genders), and 'i' / 'le' for plurals. The masculine 'lo' / 'gli' (before s+consonant, z, ps, gn) come up more fully in later stories.",
                  "_id": "a1-g-05",
                  "_status": "supporting",
                  "examples": [
                        {
                              "de": "il lago",
                              "en": "the lake",
                              "highlight": "il"
                        },
                        {
                              "de": "la classe",
                              "en": "the class",
                              "highlight": "la"
                        },
                        {
                              "de": "l'aria",
                              "en": "the air",
                              "highlight": "l'"
                        },
                        {
                              "de": "le pietre",
                              "en": "the stones",
                              "highlight": "le"
                        }
                  ],
                  "tips": [
                        "'il' / 'la' before consonants — 'l'' before vowels (both genders).",
                        "Plural: 'i' for masculine, 'le' for feminine.",
                        "Always learn a noun together with its article."
                  ],
                  "table": {
                        "title": "Definite articles in this story",
                        "headers": [
                              "",
                              "Singular",
                              "Plural"
                        ],
                        "rows": [
                              [
                                    "masculine",
                                    "il",
                                    "i"
                              ],
                              [
                                    "feminine",
                                    "la",
                                    "le"
                              ],
                              [
                                    "before vowel",
                                    "l'",
                                    "— (i / le)"
                              ]
                        ],
                        "note": "'lo' (sing.) and 'gli' (plur.) before s+consonant, z, ps, gn — covered later."
                  }
            },
            {
                  "name": "Present tense of essere and avere",
                  "tier": 2,
                  "desc": "Essere (sono, sei, è, siamo, siete, sono) for identity, location, description. Avere (ho, hai, ha, abbiamo, avete, hanno) for possession and — importantly — age (ha dieci anni).",
                  "longExplanation": "'Essere' (to be) and 'avere' (to have) are the two everyday verbs Italian leans on the most. Use 'essere' for identity, location, and description (Sono Bianca · È in classe · L'aria è fredda). Use 'avere' for possession AND for the states English expresses with 'to be' — age, hunger, thirst, cold (Ha dieci anni — literally 'she has ten years'). Memorize both paradigms now; almost every conversation uses one of them.",
                  "_id": "a1-g-06",
                  "_status": "supporting",
                  "examples": [
                        {
                              "de": "{{PROTAGONIST}} è in classe.",
                              "en": "{{PROTAGONIST}} is in class.",
                              "highlight": "è"
                        },
                        {
                              "de": "Lei ha dieci anni.",
                              "en": "She is ten years old.",
                              "highlight": "ha"
                        },
                        {
                              "de": "Io sono Bianca.",
                              "en": "I am Bianca.",
                              "highlight": "sono"
                        }
                  ],
                  "tips": [
                        "'essere' = identity, location, traits.",
                        "'avere' = possession AND age, hunger, thirst, fear.",
                        "English says 'I am 10' — Italian says 'I have 10 years' (Ho dieci anni)."
                  ],
                  "table": {
                        "title": "Present tense — essere & avere",
                        "headers": [
                              "",
                              "essere (to be)",
                              "avere (to have)"
                        ],
                        "rows": [
                              [
                                    "io",
                                    "sono",
                                    "ho"
                              ],
                              [
                                    "tu",
                                    "sei",
                                    "hai"
                              ],
                              [
                                    "lui / lei",
                                    "è",
                                    "ha"
                              ],
                              [
                                    "noi",
                                    "siamo",
                                    "abbiamo"
                              ],
                              [
                                    "voi",
                                    "siete",
                                    "avete"
                              ],
                              [
                                    "loro",
                                    "sono",
                                    "hanno"
                              ]
                        ]
                  }
            },
            {
                  "name": "Adjective agreement",
                  "tier": 2,
                  "desc": "Adjectives agree with the noun in gender and number: una bambina piccola, un bambino piccolo, le pietre bagnate.",
                  "longExplanation": "Adjectives in Italian shift their ending to match the noun's gender and number. Most adjectives have four forms: -o (masc. sing.), -a (fem. sing.), -i (masc. plur.), -e (fem. plur.) — so piccolo, piccola, piccoli, piccole. Some adjectives end in -e in the singular (grande, felice) and use only -e / -i. The adjective usually follows the noun, but a small core (bello, buono, grande, piccolo, vecchio, giovane) often goes before.",
                  "_id": "a1-g-07",
                  "_status": "supporting",
                  "examples": [
                        {
                              "de": "una bambina piccola",
                              "en": "a small girl",
                              "highlight": "piccola"
                        },
                        {
                              "de": "un bambino piccolo",
                              "en": "a small boy",
                              "highlight": "piccolo"
                        },
                        {
                              "de": "le pietre bagnate",
                              "en": "the wet stones",
                              "highlight": "bagnate"
                        }
                  ],
                  "tips": [
                        "Adjective ending must match the noun's gender + number.",
                        "Most adjectives have 4 forms: -o / -a / -i / -e.",
                        "Adjectives ending in -e (singular) use only 2 forms: -e (sing.) / -i (plur.)."
                  ],
                  "table": {
                        "title": "Adjective endings",
                        "headers": [
                              "",
                              "Singular",
                              "Plural"
                        ],
                        "rows": [
                              [
                                    "masculine",
                                    "-o",
                                    "-i"
                              ],
                              [
                                    "feminine",
                                    "-a",
                                    "-e"
                              ],
                              [
                                    "both (-e type)",
                                    "-e",
                                    "-i"
                              ]
                        ]
                  }
            }
      ],
      "grammarTests": [
            {
                  "tier": 1,
                  "rule": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "en": "She speaks.",
                  "de": "Lei parla.",
                  "trap": "Subject pronoun used overtly for emphasis.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-01"
            },
            {
                  "tier": 1,
                  "rule": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "en": "They look.",
                  "de": "Loro guardano.",
                  "trap": "3pl subject pronoun + verb.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-01"
            },
            {
                  "tier": 1,
                  "rule": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "en": "We are ready.",
                  "de": "Noi siamo pronti.",
                  "trap": "Noi + essere 1pl. Pronti masc plural by default group.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-01"
            },
            {
                  "tier": 1,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "___ casa",
                  "de": "la",
                  "trap": "Casa is feminine.",
                  "_type": "choose-article",
                  "_options": [
                        "il",
                        "la",
                        "l'",
                        "lo"
                  ],
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 1,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "___ lago",
                  "de": "il",
                  "trap": "Lago is masculine.",
                  "_type": "choose-article",
                  "_options": [
                        "il",
                        "la",
                        "l'",
                        "lo"
                  ],
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 1,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "___ aria",
                  "de": "l'",
                  "trap": "Feminine noun starting with a vowel takes the elided l'.",
                  "_type": "choose-article",
                  "_options": [
                        "il",
                        "la",
                        "l'",
                        "lo"
                  ],
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 2,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "The pencil is small.",
                  "de": "La matita è piccola.",
                  "trap": "Feminine article + feminine adjective agreement.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 2,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "The book is new.",
                  "de": "Il libro è nuovo.",
                  "trap": "Masculine article + masculine adjective agreement.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 2,
                  "rule": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "en": "He doesn't speak. She speaks.",
                  "de": "Lui non parla. Lei parla.",
                  "trap": "Overt pronouns for contrast.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-01"
            },
            {
                  "tier": 2,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "The other girls are at home.",
                  "de": "Le altre bambine sono a casa.",
                  "trap": "Feminine plural article + adjective + noun + essere 3pl.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-02"
            },
            {
                  "tier": 3,
                  "rule": "Subject pronouns (io, tu, lui/lei, noi, voi, loro)",
                  "en": "We are at school. They are at home.",
                  "de": "Noi siamo a scuola. Loro sono a casa.",
                  "trap": "Two contrastive overt pronouns in two clauses.",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-01"
            },
            {
                  "tier": 3,
                  "rule": "Noun gender (masculine / feminine)",
                  "en": "The white sheet is on the desk.",
                  "de": "Il foglio bianco è sul banco.",
                  "trap": "Masculine noun + masculine adjective + articulated preposition (su + il = sul).",
                  "_type": "translate-en-to-it",
                  "_options": null,
                  "_ruleId": "a1-g-02"
            }
      ]
};
