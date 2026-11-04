export type PeriodKey = "Q1" | "Q2" | "Q3" | "Q4" | "T1" | "T2" | "T3"
export type PeriodDefinition = { order: number; key: PeriodKey; label: string; legacy?: boolean }
export type AcademicCategory = "Written/Oral Works" | "Product/Performance Tasks" | "Examinations"
export type CategoryWeights = Record<AcademicCategory, number>

export const trimesterPeriods: PeriodDefinition[] = [
  { order: 1, key: "T1", label: "First Term" },
  { order: 2, key: "T2", label: "Second Term" },
  { order: 3, key: "T3", label: "Third Term" },
]

export type EarlyLearningRating = { value: string; label: string; description: string; indicators?: string[] }

export const earlyLearningPolicies: Record<0 | 1, {
  name: string
  description: string
  ratings: EarlyLearningRating[]
}> = {
  0: {
    name: "Kindergarten competency progress",
    description: "Record each Kindergarten Curriculum Guide competency by developmental domain each term. Do not calculate a numeric subject grade or transmute ratings.",
    ratings: [
      { value: "CO", label: "Consistent", description: "Always demonstrates the expected competency.", indicators: ["Always participates in activities and works independently.", "Always performs tasks; advanced in some aspects."] },
      { value: "DV", label: "Developing", description: "Sometimes demonstrates the competency.", indicators: ["Sometimes participates with minimal supervision.", "Progresses continuously in assigned tasks."] },
      { value: "BG", label: "Beginning", description: "Rarely demonstrates the expected competency.", indicators: ["Rarely participates or initiates independent work.", "Shows interest in tasks but needs close supervision."] },
    ],
  },
  1: {
    name: "Grade 1 PACE",
    description: "Use the PACE letter descriptors and term narrative. Do not calculate a weighted numeric subject grade or transmute ratings.",
    ratings: [
      { value: "A", label: "Advancing", description: "Namumukod-tangi" },
      { value: "B", label: "Benchmarking", description: "Naipamamalas" },
      { value: "C", label: "Connecting", description: "Natutungo" },
      { value: "D", label: "Developing", description: "Nagpapaunlad" },
      { value: "E", label: "Emerging", description: "Nagsisimula" },
    ],
  },
}

export type KinderCompetencyDomain = {
  name: string
  competencies: string[]
}

export const kinderCompetencyDomains: KinderCompetencyDomain[] = [
  {
    name: "I. Sensory Perceptual and Motor Development",
    competencies: [
      "1. Identifies external body parts and their functions",
      "2. Identifies ways to care for and protects one’s body",
      "3. Demonstrates gross motor skills (locomotor, non-locomotor)",
      "4. Moves body parts as directed",
      "5. Demonstrates fine motor skills (tearing, cutting, rolling, molding with playdough)",
    ],
  },
  {
    name: "II. Socio-emotional Development",
    competencies: [
      "1. Identifies and expresses feelings in appropriate ways",
      "2. Recognizes and respect feelings of others",
      "3. Expresses needs and preferences",
      "4. Behaves appropriately in different situations",
      "5. Participates in classroom routines and activities",
      "6. Follows classroom and school rules",
      "7. Fulfills classroom responsibilities",
    ],
  },
  {
    name: "III. Cognitive Development",
    competencies: [
      "1. Identifies attributes of objects (color, shape, size)",
      "2. Matches objects based on attributes",
      "3. Describes objects based on attributes (shape, color, taste, texture)",
      "4. Classifies objects by a single attribute (color, shape, size)",
      "5. Reclassifies objects according to multiple attributes",
      "6. Arranges objects according to specific attributes",
      "7. Recognizes, extends and create patterns using concrete objects",
      "8. Measures size, length, capacity and mass of objects using non-standard measuring tools",
      "9. Identifies position of objects (in, on, over, under, top, bottom)",
      "10. Compares quantities of objects (more/less)",
      "11. Counts with one-to-one correspondence",
      "12. Recognizes numerals",
      "13. Matches numerals to objects",
      "14. Adds and subtracts using concrete objects",
      "15. Recognizes clock as measure of time (hours and minutes)",
      "16. Shows awareness and care for the natural and physical environment",
      "17. Talks about participation in cultural and religious activities",
      "18. Shows awareness of the importance of caring for the natural and physical environment through simple practices (e.g., sorting trash, helping to clean up)",
      "19. Predicts outcomes in familiar stories read aloud in class",
      "20. Suggests solutions to problems in class activities and stories read aloud in class",
    ],
  },
  {
    name: "IV. Language, Literacy, and Communication Development",
    competencies: [
      "A. Listening and Viewing — 1. Identifies familiar environmental sound",
      "A. Listening and Viewing — 2. Recalls what happens first, middle and end in a story",
      "A. Listening and Viewing — 3. Retells story in sequence",
      "A. Listening and Viewing — 4. Follows 1-2 step instructions",
      "B. Sight Word Recognition — 5. Recognizes non-decodable words in and out of context automatically",
      "B. Sight Word Recognition — 6. Recognizes sight words",
      "C. Speaking — 7. Identifies first and last name",
      "C. Speaking — 8. Identifies classmates, teachers, family member",
      "C. Speaking — 9. Identifies familiar objects at home, in school and in the community",
      "C. Speaking — 10. Uses polite greetings and courteous expressions in varied situations",
      "C. Speaking — 11. Retells personal experiences to story events",
      "C. Speaking — 12. Expresses ideas and feelings using phrases and simple sentences",
      "D. Reading · Phonological/Phonemic Awareness — 13. Orally segment sounds: syllable, onset and rime, phoneme by phoneme",
      "D. Reading · Letter Knowledge — 14. Identifies uppercase letters",
      "D. Reading · Letter Knowledge — 15. Identifies lowercase letters",
      "D. Reading · Letter Knowledge — 16. Matches upper and lowercase letters",
      "D. Reading · Letter Sound Relationship — 17. Identifies letter sounds",
      "D. Reading · Letter Sound Relationship — 18. Matches letters and their corresponding sounds",
      "E. Comprehension — 19. Uses a variety of strategies to gain meaning of leveled texts",
      "E. Comprehension — 20. Uses print and illustrations to make meaning",
      "F. Concepts of Print — 21. Demonstrates book handling skills",
      "F. Concepts of Print — 22. Distinguishes between letters, words, and sentences",
      "F. Concepts of Print — 23. Demonstrates awareness of print (left to right and top to bottom)",
      "G. Writing — 24. Traces/draws/copies shapes, designs, pictures",
      "G. Writing — 25. Traces/copies/writes name, words",
      "G. Writing — 26. Writes uppercase and lowercase letters",
      "G. Writing — 27. Spells sight words",
      "G. Writing — 28. Spells simple words phonetically",
    ],
  },
]

export function kinderCompetencyKey(domain: string, competency: string) {
  return `${domain} — ${competency}`
}

export function kinderCompetencyList() {
  return kinderCompetencyDomains.flatMap((domain) =>
    domain.competencies.map((competency) => ({
      domain: domain.name,
      competency,
      key: kinderCompetencyKey(domain.name, competency),
    })),
  )
}

const gradeOnePaceCompetencies: Record<string, string[]> = {
  "Reading & Literacy": [
    "Phonological Awareness — Chant rhymes and poems.",
    "Phonological Awareness — Segment a two or three syllable word into its syllabic parts.",
    "Phonological Awareness — Identify rhyming words in nursery rhymes, poems, and chants.",
    "Phonological Awareness — Say two or three words that rhyme.",
    "Phonological Awareness — Identify initial sounds (vowels, consonants, and semi-vowels, if any).",
    "Phonics and Word Study — Produce the sound of letters of L1.",
    "Phonics and Word Study — Identify the letters in L1.",
    "Phonics and Word Study — Isolate sounds (consonants and vowels) in a word (beginning and/or ending).",
    "Phonics and Word Study — Substitute individual sounds in simple words to make new words.",
    "Phonics and Word Study — Sound out words accurately.",
    "Vocabulary and Word Knowledge — Use vocabulary referring to self, family, school, community, and environment.",
    "Vocabulary and Word Knowledge — Identify words with different functions (naming and describing words).",
    "Vocabulary and Word Knowledge — Identify words that label persons, places, things, animals, actions, situations, ideas, and emotions.",
    "Vocabulary and Word Knowledge — Identify words that describe persons, places, things, animals, actions, situations, ideas, and emotions.",
    "Vocabulary and Word Knowledge — Read high-frequency words accurately for meaning.",
    "Vocabulary and Word Knowledge — Read content-specific words (Math, Makabansa, and GMRC) accurately for meaning.",
    "Vocabulary and Word Knowledge — Write words legibly and correctly.",
    "Book and Print Knowledge — Recognize environmental print (symbols).",
    "Book and Print Knowledge — Recognize the parts of the book (cover page, title page, etc.).",
    "Book and Print Knowledge — Recognize proper eye movement skills in reading: left to right, top to bottom, and return sweep.",
    "Comprehending and Analyzing Texts — Read sentences with appropriate speed, accuracy, and expression.",
    "Comprehending and Analyzing Texts — Comprehend stories and note important details (character, setting, and events).",
    "Comprehending and Analyzing Texts — Sequence events in stories.",
    "Comprehending and Analyzing Texts — Infer the character's feelings and traits.",
    "Comprehending and Analyzing Texts — Predict possible endings.",
    "Comprehending and Analyzing Texts — Relate story events to one's experience.",
    "Comprehending and Analyzing Texts — Identify cause and effects of events.",
    "Comprehending and Analyzing Texts — Identify problem and solution in stories.",
    "Comprehending and Analyzing Texts — Comprehend informational text and note significant details (list and describe).",
    "Comprehending and Analyzing Texts — Identify problem and solution in informational text.",
    "Creating and Composing Texts — Narrate one's personal experiences about oneself and family.",
    "Creating and Composing Texts — Narrate one's personal experiences about school.",
    "Creating and Composing Texts — Narrate one's personal experiences about community.",
    "Creating and Composing Texts — Retell myths, legends, fables, and narrative poems in one's own words.",
    "Creating and Composing Texts — Respond creatively to myths, legends, fables, and narrative poems.",
  ],
  Language: [
    "Language for Interacting with Others — Talk about one's personal experiences (oneself and family).",
    "Language for Interacting with Others — Talk about one's personal experiences (school).",
    "Language for Interacting with Others — Talk about one's personal experiences (community).",
    "Language for Interacting with Others — Respond to teacher's instructions.",
    "Language for Interacting with Others — Ask and respond to questions.",
    "Language for Interacting with Others — Make requests.",
    "Language for Interacting with Others — Offer information.",
    "Language for Interacting with Others — Communicate needs.",
    "Language for Interacting with Others — Clarify information.",
    "Language for Interacting with Others — Seek help.",
    "Language for Interacting with Others — Take part in or take turns in conversation or discussion.",
    "Language for Interacting with Others — Use common and socially acceptable expressions (greetings and leave-taking).",
    "Language for Interacting with Others — Use simple and appropriate personal greetings.",
    "Language for Interacting with Others — Use familiar terms of address.",
    "Language for Interacting with Others — Greet and respond appropriately to greetings.",
    "Language for Interacting with Others — Share thoughts, preferences, needs, feelings, and ideas confidently.",
    "Language for Developing and Expressing Ideas — Participate in and contribute to group oral language activities.",
    "Language for Developing and Expressing Ideas — Notice features (sounds, intonation, signs) of first and other languages in familiar contexts.",
    "Language for Developing and Expressing Ideas — Recognize how intonation and body language can change meaning.",
    "Language for Developing and Expressing Ideas — Recognize statements, questions, commands, and exclamations.",
    "Language for Developing and Expressing Ideas — Respond to tones and cues through facial expressions, gestures, and actions.",
    "Language for Developing and Expressing Ideas — Recognize how language reflects cultural practices and norms.",
    "Language for Developing and Expressing Ideas — Share language(s) spoken at home.",
    "Language for Developing and Expressing Ideas — Share words and phrases in one's language.",
    "Language for Developing and Expressing Ideas — Notice local place names and their origins in one's language.",
    "Language for Developing and Expressing Ideas — Explore local terms for food and their origins.",
    "Language for Developing and Expressing Ideas — Express ideas using symbols (drawings, emojis, scribbles).",
    "Language for Developing and Expressing Ideas — Express ideas about oneself and family.",
    "Language for Developing and Expressing Ideas — Express ideas about school.",
    "Language for Developing and Expressing Ideas — Express ideas about community.",
    "Language for Developing and Expressing Ideas — Use words for people, animals, objects, and locations.",
    "Language for Developing and Expressing Ideas — Use words for activities and situations.",
    "Language for Developing and Expressing Ideas — Use words for qualities or attributes.",
    "Language for Developing and Expressing Ideas — Use high-frequency and content-specific words about oneself and family, school, and community.",
    "Language for Developing and Expressing Ideas — Express compare and contrast.",
    "Language for Developing and Expressing Ideas — Express cause and effect.",
    "Language for Developing and Expressing Ideas — Use time words to relate ideas.",
    "Interacting with Texts — View and listen to a range of texts for enjoyment and interest.",
    "Interacting with Texts — Recognize icons and symbols in familiar print and digital texts.",
    "Interacting with Texts — Engage with or respond to a range of texts.",
    "Interacting with Texts — Identify purposes for viewing and listening to texts.",
    "Interacting with Texts — Discuss what is interesting or entertaining in a text.",
    "Interacting with Texts — Express personal preferences and give reasons for text choices.",
    "Creating Texts — Record and report ideas and events using learnt vocabulary.",
    "Creating Texts — Note and report main points.",
    "Creating Texts — Sequence up to three key events.",
    "Creating Texts — Relate ideas or events to one's experience.",
    "Creating Texts — Retell information from texts in one's own words.",
    "Creating Texts — Draw and discuss information or ideas from texts.",
    "Creating Texts — Describe main points, characters, and events.",
    "Creating Texts — Infer character feelings and traits.",
    "Creating Texts — Predict possible endings.",
  ],
  Mathematics: [
    "Number and Algebra — Count up to 100, including counting up or down and identifying one more or one less.",
    "Number and Algebra — Read and write numerals up to 100.",
    "Number and Algebra — Represent numbers up to 100 using concrete and pictorial models.",
    "Number and Algebra — Compare two numbers up to 20.",
    "Number and Algebra — Order numbers up to 20 from smallest to largest and vice versa.",
    "Number and Algebra — Describe object positions using ordinal numbers from 1st to 10th.",
    "Number and Algebra — Compose and decompose numbers up to 10 using concrete materials.",
    "Number and Algebra — Illustrate addition with sums up to 20 using models.",
      "Number and Algebra — Apply the zero property of addition: zero plus any number equals that number.",
      "Number and Algebra — Apply the property that changing the order of addends does not change the sum.",
    "Number and Algebra — Solve oral or pictorial addition problems with sums up to 20.",
    "Measurement and Geometry — Identify triangles, rectangles, and squares in different sizes and orientations.",
    "Measurement and Geometry — Compare 2D shapes by features such as sides and corners.",
    "Measurement and Geometry — Compose and decompose triangles, squares, and rectangles.",
    "Measurement and Geometry — Measure object lengths and distances using non-standard units.",
    "Measurement and Geometry — Compare lengths and distances using non-standard units.",
    "Measurement and Geometry — Solve problems involving lengths and distances using non-standard units.",
    "Number and Algebra — Order numbers up to 100.",
    "Number and Algebra — Count by 2s, 5s, and 10s up to 100.",
    "Number and Algebra — Determine the place value of a digit in a 2-digit number.",
    "Number and Algebra — Determine the value of a digit in a 2-digit number.",
    "Number and Algebra — Determine the digit of a number when given its place value.",
    "Number and Algebra — Decompose a 2-digit number into tens and ones.",
    "Number and Algebra — Add numbers by expressing addends as tens and ones.",
    "Number and Algebra — Add 2-digit and 1-digit numbers with sums up to 100 without regrouping using models.",
    "Number and Algebra — Add 2-digit and 2-digit numbers with sums up to 100 without regrouping using models.",
    "Number and Algebra — Solve oral or pictorial addition problems with sums up to 100 without regrouping.",
    "Number and Algebra — Illustrate subtraction of numbers up to 20 using models.",
    "Number and Algebra — Find missing numbers in addition or subtraction sentences up to 20.",
    "Number and Algebra — Write equivalent addition or subtraction expressions.",
    "Number and Algebra — Solve subtraction problems where both numbers are less than 20.",
    "Number and Algebra — Subtract 2-digit minus 1-digit numbers less than 100 without regrouping using models.",
    "Number and Algebra — Subtract 2-digit minus 2-digit numbers less than 100 without regrouping using models.",
    "Number and Algebra — Subtract by expressing numbers as tens and ones without regrouping.",
    "Data and Probability — Collect one-variable data through a simple interview.",
    "Data and Probability — Present data in a pictograph without a scale.",
    "Data and Probability — Interpret a pictograph without a scale.",
    "Data and Probability — Organize pictograph data into a table.",
    "Number and Algebra — Determine the next terms in a repeating pattern.",
    "Number and Algebra — Create repeating patterns using objects, images, or numbers.",
    "Number and Algebra — Illustrate one-half and one-fourth as parts of a whole.",
    "Number and Algebra — Compare one-half and one-fourth using models.",
    "Number and Algebra — Count halves and quarters.",
    "Number and Algebra — Recognize coins and bills up to 100 pesos and their notations.",
    "Number and Algebra — Determine the value of bills or coins up to 100 pesos.",
    "Number and Algebra — Compare denominations of peso coins and bills up to 100 pesos.",
    "Number and Algebra — Solve one-step addition or subtraction problems involving money up to 100 pesos.",
    "Measurement and Geometry — Identify positions after half-turns or quarter-turns clockwise or counter-clockwise.",
    "Measurement and Geometry — Read and write time by the hour, half hour, and quarter hour.",
    "Measurement and Geometry — Give the days of the week and months of the year in order.",
    "Measurement and Geometry — Determine the day and month using a calendar.",
    "Measurement and Geometry — Solve problems involving time, days, and months.",
  ],
  GMRC: [
    "Tiwala sa Sarili (Self-Confidence)",
    "Pagiging Totoo (Sincerity)",
    "Tiyaga (Perseverance)",
    "Madasalin (Prayerful)",
    "Mapagpasalamat (Gratitude)",
    "Magalang (Respectful)",
    "Kalinisan (Cleanliness)",
    "Responsable (Responsible)",
    "Matulungin (Helpful)",
    "Masunurin (Obedient)",
    "Mapagbigay (Generosity)",
    "Mapagmalasakit (Compassion)",
    "Mabuting Mamamayan (Good Citizenship)",
    "Pagmamahal sa Bayan (Love of Country)",
  ],
  Makabansa: [
    "Nailalarawan ang iba't-ibang katangiang pisikal ng bawat tao.",
    "Nailalarawan ang iba't-ibang pangangailangan ng bawat tao.",
    "Naipaliliwanag ang karapatan at tungkulin ng bawat bata.",
    "Napahahalagahan ang indibidwalidad ng bawat tao.",
    "Naipapaliwanag ang konsepto ng pamilya batay sa bumubuo nito (two-parent, solo parent, extended family, at iba pa).",
    "Naipaliliwanag ang papel at tungkulin ng mga kasapi ng pamilya.",
    "Napahahalagahan ang papel at tungkulin ng mga kasapi ng pamilya.",
    "Nailalahad ang batayang impormasyon tungkol sa sariling paaralan (pangalan, pinagmulan, laki at lawak, kinaroroonan, at kuwento).",
    "Naipaliliwanag ang tungkulin ng mga taong bumubuo sa paaralan.",
    "Natutukoy ang kahalagahan ng mga palatandaan at estruktura mula tahanan patungo sa paaralan.",
    "Napahahalagahan ang sariling paaralan bilang bahagi ng pamayanan.",
    "Natutukoy ang mga kasapi ng pamayanan na umaagapay sa pamilya at paaralan.",
    "Naipaliliwanag ang papel ng mga kasapi ng kinabibilangang pamayanan.",
    "Napahahalagahan ang papel ng mga kasapi ng kinabibilangang pamayanan.",
  ],
}

function normalizeGradeOneSubject(subject: string | null | undefined) {
  return (subject ?? "").trim().toLowerCase().replaceAll("&", "and").replaceAll(/\s+/g, " ")
}

export function gradeOnePaceCompetenciesForSubject(subject: string | null | undefined, gradingPeriod?: PeriodKey | string | null) {
  const normalized = normalizeGradeOneSubject(subject)
  const entry = Object.entries(gradeOnePaceCompetencies).find(([name]) =>
    normalizeGradeOneSubject(name) === normalized ||
    (normalized === "reading and literacy" && name === "Reading & Literacy"),
  )
  const competencies = entry?.[1] ?? []
  if (!gradingPeriod) return competencies
  if (entry?.[0] === "Mathematics") {
    const ranges: Record<string, [number, number]> = { T1: [0, 17], T2: [17, 38], T3: [38, 52] }
    const range = ranges[gradingPeriod]
    return range ? competencies.slice(range[0], range[1]) : []
  }
  if (entry?.[0] === "Makabansa") {
    const ranges: Record<string, [number, number]> = { T1: [0, 4], T2: [4, 7], T3: [7, 14] }
    const range = ranges[gradingPeriod]
    return range ? competencies.slice(range[0], range[1]) : []
  }
  if (entry?.[0] === "GMRC") {
    const termCompetencies: Record<string, string[]> = {
      T1: [
        "Tiwala sa Sarili (Self-Confidence) — Use basic personal information in appropriate situations.",
        "Pagiging Totoo (Sincerity) — Show sincerity through good interactions with others.",
        "Tiyaga (Perseverance) — Regularly save collected money in a piggy bank or container.",
        "Madasalin (Prayerful) — Use proper actions and words when praying.",
        "Mapagpasalamat (Gratitude) — Care for resources from the environment.",
        "Magalang (Respectful) — Value children's rights through appropriate actions.",
        "Kalinisan (Cleanliness) — Follow personal-cleanliness routines with family or caregiver guidance.",
      ],
      T2: [
        "Magalang (Respectful) — Respond appropriately to messages from others.",
        "Responsable (Responsible) — Join community tasks according to one's ability.",
        "Matulungin (Helpful) — Help with household tasks according to one's ability.",
        "Matulungin (Helpful) — Help older people safely through appropriate helpful tasks.",
        "Madasalin (Prayerful) — Participate in family prayer.",
        "Kalinisan (Cleanliness) — Participate in caring for the environment.",
        "Masunurin (Obedient) — Follow good Filipino family practices.",
        "Tiwala sa Sarili (Self-Confidence) — Do tasks that benefit oneself and others as guided by family.",
        "Mapagbigay (Generosity) — Voluntarily share what one has.",
      ],
      T3: [
        "Magalang (Respectful) — Follow instructions and rules in places of worship.",
        "Kalinisan (Cleanliness) — Remind peers to keep the environment orderly and clean.",
        "Mapagmalasakit (Compassion) — Voluntarily share what one has with others.",
        "Mapagmalasakit (Compassion) — Encourage others to join simple environmental-care activities.",
        "Mapagbigay (Generosity) — Voluntarily share what one has.",
        "Mabuting Mamamayan (Good Citizenship) — Voluntarily help family with community activities.",
        "Magalang (Respectful) — Act appropriately in different religious activities and community beliefs.",
        "Pagmamahal sa Bayan (Love of Country) — Follow rules for national symbols.",
      ],
    }
    return termCompetencies[gradingPeriod] ?? []
  }
  return competencies
}

export const quarterPeriods: PeriodDefinition[] = [
  { order: 1, key: "Q1", label: "First Quarter" },
  { order: 2, key: "Q2", label: "Second Quarter" },
  { order: 3, key: "Q3", label: "Third Quarter" },
  { order: 4, key: "Q4", label: "Fourth Quarter" },
]

export const legacyFourthQuarter: PeriodDefinition = {
  order: 4,
  key: "Q4",
  label: "Legacy Fourth Quarter",
  legacy: true,
}
export const legacyFourthQuarterOption: PeriodDefinition = {
  order: 4,
  key: "Q4",
  label: "Archived period",
  legacy: true,
}

export const academicCategories: AcademicCategory[] = [
  "Written/Oral Works",
  "Product/Performance Tasks",
  "Examinations",
]

export const gradeSubjects: Record<number, string[]> = {
  0: ["Kinder Competencies"],
  1: ["Reading & Literacy", "Language", "Mathematics", "GMRC", "Makabansa"],
  2: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  3: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  4: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  5: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  6: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
}

export const passingGrade = 75

export const transmutationTable: Array<{ min: number; max: number; grade: number }> = [
  { min: 99.5, max: 100, grade: 100 },
  { min: 98.32, max: 99.49, grade: 99 },
  { min: 97.14, max: 98.31, grade: 98 },
  { min: 95.96, max: 97.13, grade: 97 },
  { min: 94.78, max: 95.95, grade: 96 },
  { min: 93.6, max: 94.77, grade: 95 },
  { min: 92.42, max: 93.59, grade: 94 },
  { min: 91.24, max: 92.41, grade: 93 },
  { min: 90.06, max: 91.23, grade: 92 },
  { min: 88.88, max: 90.05, grade: 91 },
  { min: 87.7, max: 88.87, grade: 90 },
  { min: 86.52, max: 87.69, grade: 89 },
  { min: 85.34, max: 86.51, grade: 88 },
  { min: 84.16, max: 85.33, grade: 87 },
  { min: 82.98, max: 84.15, grade: 86 },
  { min: 81.8, max: 82.97, grade: 85 },
  { min: 80.62, max: 81.79, grade: 84 },
  { min: 79.44, max: 80.61, grade: 83 },
  { min: 78.26, max: 79.43, grade: 82 },
  { min: 77.08, max: 78.25, grade: 81 },
  { min: 75.9, max: 77.07, grade: 80 },
  { min: 74.72, max: 75.89, grade: 79 },
  { min: 73.54, max: 74.71, grade: 78 },
  { min: 72.36, max: 73.53, grade: 77 },
  { min: 71.18, max: 72.35, grade: 76 },
  { min: 70, max: 71.17, grade: 75 },
  { min: 65.34, max: 69.99, grade: 74 },
  { min: 60.67, max: 65.33, grade: 73 },
  { min: 56.01, max: 60.66, grade: 72 },
  { min: 51.34, max: 56, grade: 71 },
  { min: 46.67, max: 51.33, grade: 70 },
  { min: 42.01, max: 46.66, grade: 69 },
  { min: 37.34, max: 42, grade: 68 },
  { min: 32.68, max: 37.33, grade: 67 },
  { min: 28.01, max: 32.67, grade: 66 },
  { min: 23.35, max: 28, grade: 65 },
  { min: 18.68, max: 23.34, grade: 64 },
  { min: 14.01, max: 18.67, grade: 63 },
  { min: 9.35, max: 14, grade: 62 },
  { min: 4.68, max: 9.34, grade: 61 },
  { min: 0, max: 4.67, grade: 60 },
]

export const descriptors = [
  { min: 90, max: 100, label: "Advancing", description: "Consistently demonstrates skills and understanding that meet or exceed standards with independence, flexibility, and depth." },
  { min: 80, max: 89, label: "Benchmarking", description: "Demonstrates expected grade-level skills and understanding competently and independently." },
  { min: 75, max: 79, label: "Connecting", description: "Demonstrates sufficient understanding and application of grade-level standards with occasional guidance and support." },
  { min: 65, max: 74, label: "Developing", description: "Demonstrates partial understanding and inconsistent application of skills, requires targeted support and scaffolding." },
  { min: 60, max: 64, label: "Emerging", description: "Does not yet demonstrate foundational skills and understanding; requires intensive support." },
]

const standardWeights: CategoryWeights = {
  "Written/Oral Works": 20,
  "Product/Performance Tasks": 50,
  Examinations: 30,
}

const practicalWeights: CategoryWeights = {
  "Written/Oral Works": 20,
  "Product/Performance Tasks": 60,
  Examinations: 20,
}

export function isTrimesterSchoolYear(schoolYear: string | null | undefined) {
  const startYear = Number(schoolYear?.match(/\d{4}/)?.[0])
  return Number.isFinite(startYear) && startYear >= 2026
}

export function periodsForSchoolYear(schoolYear: string | null | undefined) {
  return isTrimesterSchoolYear(schoolYear) ? trimesterPeriods : quarterPeriods
}

export function normalizePeriod(value: string | null | undefined): PeriodKey | null {
  const normalized = value?.trim().toLowerCase() ?? ""
  const compact = normalized.match(/^(q|t|quarter|term)\s*([1-4])$/)
  if (compact) {
    const number = Number(compact[2])
    if (compact[1] === "t" || compact[1] === "term") return number <= 3 ? `T${number}` as PeriodKey : null
    return `Q${number}` as PeriodKey
  }
  const ordinal = ["first", "second", "third", "fourth"].findIndex((name) => normalized.includes(name))
  if (ordinal < 0) return null
  if (normalized.includes("term")) return ordinal < 3 ? `T${ordinal + 1}` as PeriodKey : null
  return `Q${ordinal + 1}` as PeriodKey
}

export function periodKeyForSchoolYear(value: string | null | undefined, schoolYear: string | null | undefined): PeriodKey | null {
  const key = normalizePeriod(value)
  if (key?.startsWith("Q") && isTrimesterSchoolYear(schoolYear) && key !== "Q4") return `T${key.slice(1)}` as PeriodKey
  return key
}

export function periodLabel(value: string | null | undefined) {
  const key = normalizePeriod(value)
  return [...trimesterPeriods, ...quarterPeriods].find((period) => period.key === key)?.label ?? value ?? ""
}

export function periodLabelForSchoolYear(value: string | null | undefined, schoolYear: string | null | undefined) {
  const key = periodKeyForSchoolYear(value, schoolYear)
  if (key === "Q4" && isTrimesterSchoolYear(schoolYear)) return legacyFourthQuarterOption.label
  return periodLabel(key ?? value)
}

export function periodOptionsForSchoolYear(
  schoolYear: string | null | undefined,
  storedPeriods: Array<{ short_label: string; display_name: string }> = [],
) {
  if (!isTrimesterSchoolYear(schoolYear)) {
    return storedPeriods.length
      ? storedPeriods.map((period, index) => ({
        order: index + 1,
        short_label: normalizePeriod(period.short_label) ?? period.short_label,
        display_name: periodLabel(period.display_name),
      }))
      : quarterPeriods.map((period) => ({ order: period.order, short_label: period.key, display_name: period.label }))
  }
  return trimesterPeriods.map((period) => ({ order: period.order, short_label: period.key, display_name: period.label }))
}

export function gradingPeriodsForGrade(
  gradeLevel: number | null | undefined,
  schoolYear: string | null | undefined,
  storedPeriods: Array<{ short_label: string; display_name: string }> = [],
) {
  return gradeLevel === 0 || gradeLevel === 1
    ? trimesterPeriods.map((period) => ({
        order: period.order,
        short_label: period.key,
        display_name: period.label,
      }))
    : periodOptionsForSchoolYear(schoolYear, storedPeriods)
}

export function gradeLevelLabel(gradeLevel: number | null | undefined) {
  return gradeLevel === 0 ? "Kinder" : gradeLevel == null ? "—" : `Grade ${gradeLevel}`
}

export function subjectsForGrade(gradeLevel: number | null | undefined) {
  return gradeSubjects[gradeLevel ?? -1] ?? []
}

export function normalizeCategoryWeights(weights: Record<string, number> | null | undefined, fallback: CategoryWeights): CategoryWeights {
  return {
    "Written/Oral Works": Number(weights?.["Written/Oral Works"] ?? weights?.["Written Work"] ?? fallback["Written/Oral Works"]),
    "Product/Performance Tasks": Number(weights?.["Product/Performance Tasks"] ?? weights?.["Performance Tasks"] ?? fallback["Product/Performance Tasks"]),
    Examinations: Number(weights?.Examinations ?? weights?.["Quarterly Assessment"] ?? fallback.Examinations),
  }
}

export function categoryWeightsFor(gradeLevel: number, subject: string): CategoryWeights {
  if (gradeLevel < 2) return { ...standardWeights }
  const name = subject.trim().toLowerCase().replaceAll("&", "and").replaceAll(/\s+/g, " ")
  const practical = ["mapeh", "music", "arts", "music and arts", "physical education", "health", "pe and health", "physical education and health", "epp", "epp-tle", "tle", "technology and livelihood education", "edukasyong pantahanan at pangkabuhayan"]
  return { ...(practical.includes(name) ? practicalWeights : standardWeights) }
}

export function transmutedGradeFor(initialGrade: number) {
  return transmutationTable.find((band) => initialGrade >= band.min && initialGrade <= band.max)?.grade ?? null
}

export function mapehCompositeTermGrade(musicAndArtsGrade: number | null, physicalEducationAndHealthGrade: number | null) {
  if (musicAndArtsGrade === null || physicalEducationAndHealthGrade === null) return null
  return Math.round((musicAndArtsGrade + physicalEducationAndHealthGrade) / 2)
}

export function mapehFinalGrade(termGrades: Array<number | null>) {
  if (termGrades.length !== 3 || termGrades.some((grade) => grade === null)) return null
  return Math.round(termGrades.reduce<number>((total, grade) => total + (grade ?? 0), 0) / 3)
}

export function descriptorForGrade(grade: number | null) {
  return grade === null ? null : descriptors.find((band) => grade >= band.min && grade <= band.max) ?? null
}
