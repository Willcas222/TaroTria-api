export type ArcanaType = 'MAJOR' | 'MINOR';
export type MinorSuit = 'WANDS' | 'CUPS' | 'SWORDS' | 'PENTACLES';

export interface TarotCardSeed {
  code: string;
  name: string;
  arcana: ArcanaType;
  suit: MinorSuit | null;
  numberInSuit: number | null;
  orderIndex: number;
  uprightMeaning: string;
  reversedMeaning: string;
}

export const TAROT_DECK_CODE = 'RIDER_WAITE_ES';
export const TAROT_DECK_NAME = 'Mazo clásico';

const MAJOR_ARCANA_DATA: Array<
  Omit<TarotCardSeed, 'arcana' | 'suit' | 'numberInSuit' | 'orderIndex'>
> = [
  {
    code: 'THE_FOOL',
    name: 'El Loco',
    uprightMeaning:
      'Nuevos comienzos, espontaneidad y la disposición a dar un salto de fe hacia lo desconocido.',
    reversedMeaning:
      'Imprudencia o dudas que te frenan antes de dar el primer paso.',
  },
  {
    code: 'THE_MAGICIAN',
    name: 'El Mago',
    uprightMeaning:
      'Tienes las herramientas y la voluntad para convertir una idea en realidad.',
    reversedMeaning:
      'Potencial desaprovechado o manipulación; revisa si tus intenciones están alineadas con tus acciones.',
  },
  {
    code: 'THE_HIGH_PRIESTESS',
    name: 'La Sacerdotisa',
    uprightMeaning:
      'Intuición, misterio y sabiduría interior que invita a escuchar más de lo que hablas.',
    reversedMeaning:
      'Desconexión de tu voz interior o secretos que conviene examinar con calma.',
  },
  {
    code: 'THE_EMPRESS',
    name: 'La Emperatriz',
    uprightMeaning:
      'Abundancia, creatividad y una conexión cálida con lo que estás cultivando.',
    reversedMeaning:
      'Bloqueo creativo o descuido de tu propio bienestar mientras cuidas de otros.',
  },
  {
    code: 'THE_EMPEROR',
    name: 'El Emperador',
    uprightMeaning:
      'Estructura, liderazgo y la capacidad de poner orden en un área de tu vida.',
    reversedMeaning:
      'Rigidez excesiva o falta de control; busca equilibrio entre firmeza y flexibilidad.',
  },
  {
    code: 'THE_HIEROPHANT',
    name: 'El Hierofante',
    uprightMeaning:
      'Tradición, aprendizaje y guía a través de estructuras o mentores establecidos.',
    reversedMeaning:
      'Cuestionamiento de normas convencionales; puede ser momento de trazar tu propio camino.',
  },
  {
    code: 'THE_LOVERS',
    name: 'Los Enamorados',
    uprightMeaning:
      'Conexión genuina y decisiones tomadas desde la alineación de valores.',
    reversedMeaning:
      'Desequilibrio en una relación o una decisión importante que pide más claridad.',
  },
  {
    code: 'THE_CHARIOT',
    name: 'El Carro',
    uprightMeaning:
      'Determinación y avance firme hacia una meta, incluso ante fuerzas contrarias.',
    reversedMeaning:
      'Falta de dirección o control; conviene detenerse y recalibrar el rumbo.',
  },
  {
    code: 'STRENGTH',
    name: 'La Fuerza',
    uprightMeaning:
      'Coraje sereno y la capacidad de sostener un desafío con paciencia y compasión.',
    reversedMeaning:
      'Dudas sobre tu propia fortaleza o una tendencia a reaccionar desde el miedo.',
  },
  {
    code: 'THE_HERMIT',
    name: 'El Ermitaño',
    uprightMeaning:
      'Introspección y la búsqueda de respuestas propias antes de mirar hacia afuera.',
    reversedMeaning:
      'Aislamiento excesivo o resistencia a pedir ayuda cuando la necesitas.',
  },
  {
    code: 'WHEEL_OF_FORTUNE',
    name: 'La Rueda de la Fortuna',
    uprightMeaning:
      'Ciclos que cambian; un giro de circunstancias que está fuera de tu control total.',
    reversedMeaning: 'Resistencia al cambio o una racha que se siente estancada.',
  },
  {
    code: 'JUSTICE',
    name: 'La Justicia',
    uprightMeaning:
      'Equilibrio, honestidad y consecuencias claras de las decisiones tomadas.',
    reversedMeaning:
      'Desequilibrio o una situación que se percibe injusta y necesita revisión.',
  },
  {
    code: 'THE_HANGED_MAN',
    name: 'El Colgado',
    uprightMeaning:
      'Una pausa útil que ofrece una nueva perspectiva antes de actuar.',
    reversedMeaning: 'Estancamiento o resistencia a soltar algo que ya no sirve.',
  },
  {
    code: 'DEATH',
    name: 'La Muerte',
    uprightMeaning:
      'Cierre de una etapa que abre espacio a una transformación necesaria.',
    reversedMeaning: 'Resistencia a dejar ir algo que ya cumplió su ciclo.',
  },
  {
    code: 'TEMPERANCE',
    name: 'La Templanza',
    uprightMeaning: 'Equilibrio, paciencia y la mezcla armoniosa de opuestos.',
    reversedMeaning: 'Excesos o desajustes que piden moderación.',
  },
  {
    code: 'THE_DEVIL',
    name: 'El Diablo',
    uprightMeaning:
      'Ataduras, patrones o apegos que vale la pena mirar con honestidad.',
    reversedMeaning:
      'El inicio de liberarte de una dependencia o patrón limitante.',
  },
  {
    code: 'THE_TOWER',
    name: 'La Torre',
    uprightMeaning:
      'Un cambio repentino que sacude estructuras que ya no eran sólidas.',
    reversedMeaning:
      'Miedo al colapso o resistencia a un cambio que igual se avecina.',
  },
  {
    code: 'THE_STAR',
    name: 'La Estrella',
    uprightMeaning: 'Esperanza renovada y confianza en que las cosas pueden mejorar.',
    reversedMeaning: 'Desánimo temporal o desconexión de tu propia esperanza.',
  },
  {
    code: 'THE_MOON',
    name: 'La Luna',
    uprightMeaning:
      'Intuición frente a lo incierto; no todo es lo que parece a primera vista.',
    reversedMeaning: 'Claridad que empieza a disipar confusiones o miedos previos.',
  },
  {
    code: 'THE_SUN',
    name: 'El Sol',
    uprightMeaning: 'Vitalidad, alegría y éxito visible en lo que emprendes.',
    reversedMeaning:
      'Optimismo momentáneamente opacado; busca reconectar con tu energía.',
  },
  {
    code: 'JUDGEMENT',
    name: 'El Juicio',
    uprightMeaning:
      'Un llamado a evaluar tu camino con honestidad y dar un paso de renovación.',
    reversedMeaning: 'Autocrítica excesiva o dudas sobre una decisión importante.',
  },
  {
    code: 'THE_WORLD',
    name: 'El Mundo',
    uprightMeaning: 'Cierre satisfactorio de un ciclo y sensación de plenitud.',
    reversedMeaning: 'Un ciclo que aún no termina de cerrarse; falta un último paso.',
  },
];

const SUITS: Array<{ code: MinorSuit; nameEs: string }> = [
  { code: 'WANDS', nameEs: 'Bastos' },
  { code: 'CUPS', nameEs: 'Copas' },
  { code: 'SWORDS', nameEs: 'Espadas' },
  { code: 'PENTACLES', nameEs: 'Oros' },
];

const RANKS: Array<{
  code: string;
  nameEs: string;
  numberInSuit: number | null;
}> = [
  { code: 'ACE', nameEs: 'As', numberInSuit: 1 },
  { code: 'TWO', nameEs: 'Dos', numberInSuit: 2 },
  { code: 'THREE', nameEs: 'Tres', numberInSuit: 3 },
  { code: 'FOUR', nameEs: 'Cuatro', numberInSuit: 4 },
  { code: 'FIVE', nameEs: 'Cinco', numberInSuit: 5 },
  { code: 'SIX', nameEs: 'Seis', numberInSuit: 6 },
  { code: 'SEVEN', nameEs: 'Siete', numberInSuit: 7 },
  { code: 'EIGHT', nameEs: 'Ocho', numberInSuit: 8 },
  { code: 'NINE', nameEs: 'Nueve', numberInSuit: 9 },
  { code: 'TEN', nameEs: 'Diez', numberInSuit: 10 },
  { code: 'PAGE', nameEs: 'Paje', numberInSuit: null },
  { code: 'KNIGHT', nameEs: 'Caballero', numberInSuit: null },
  { code: 'QUEEN', nameEs: 'Reina', numberInSuit: null },
  { code: 'KING', nameEs: 'Rey', numberInSuit: null },
];

type MinorMeanings = Record<
  MinorSuit,
  Record<string, { upright: string; reversed: string }>
>;

const MINOR_MEANINGS: MinorMeanings = {
  WANDS: {
    ACE: {
      upright: 'Una chispa de inspiración o el inicio de un proyecto que te entusiasma.',
      reversed: 'Falta de dirección o un impulso que tarda en concretarse.',
    },
    TWO: {
      upright: 'Planeación y visión a futuro; estás listo para expandir tu alcance.',
      reversed: 'Indecisión frente a una oportunidad o miedo a salir de la zona conocida.',
    },
    THREE: {
      upright: 'Expansión y resultados que empiezan a asomarse en el horizonte.',
      reversed: 'Retrasos o falta de previsión en tus planes.',
    },
    FOUR: {
      upright: 'Celebración, estabilidad y un logro compartido con otros.',
      reversed: 'Armonía temporalmente interrumpida o una celebración postergada.',
    },
    FIVE: {
      upright: 'Competencia o tensión que, bien canalizada, puede impulsar el crecimiento.',
      reversed: 'Conflictos que se disuelven o la necesidad de evitar luchas innecesarias.',
    },
    SIX: {
      upright: 'Reconocimiento y una victoria que vale la pena celebrar.',
      reversed: 'Reconocimiento que tarda en llegar o dudas sobre tus propios logros.',
    },
    SEVEN: {
      upright: 'Perseverancia para defender una posición en la que crees.',
      reversed: 'Sentirte superado por la presión; considera pedir apoyo.',
    },
    EIGHT: {
      upright: 'Movimiento rápido y eventos que avanzan sin demora.',
      reversed: 'Retrasos o frustración por la lentitud de un proceso.',
    },
    NINE: {
      upright: 'Resiliencia después de haber enfrentado varios desafíos.',
      reversed: 'Agotamiento o desconfianza que conviene atender antes de seguir.',
    },
    TEN: {
      upright: 'Una carga considerable que llevas, aunque el objetivo esté cerca.',
      reversed: 'Momento de soltar responsabilidades que ya no te corresponden.',
    },
    PAGE: {
      upright: 'Curiosidad y entusiasmo por explorar una nueva idea o camino.',
      reversed: 'Impulsividad o falta de foco en un proyecto naciente.',
    },
    KNIGHT: {
      upright: 'Acción audaz y energía para lanzarte a por lo que quieres.',
      reversed: 'Impaciencia o decisiones apresuradas sin suficiente planeación.',
    },
    QUEEN: {
      upright: 'Confianza, calidez y capacidad de inspirar a quienes te rodean.',
      reversed: 'Inseguridad oculta tras una fachada de seguridad.',
    },
    KING: {
      upright: 'Liderazgo visionario y la capacidad de guiar con pasión y carácter.',
      reversed: 'Autoritarismo o impulsividad al ejercer el liderazgo.',
    },
  },
  CUPS: {
    ACE: {
      upright: 'Apertura emocional y el inicio de una conexión significativa.',
      reversed: 'Bloqueo emocional o una oportunidad afectiva que aún no fluye.',
    },
    TWO: {
      upright: 'Conexión mutua y equilibrio en una relación importante.',
      reversed: 'Desconexión o desequilibrio entre lo que das y lo que recibes.',
    },
    THREE: {
      upright: 'Celebración compartida con amistades o comunidad cercana.',
      reversed: 'Excesos sociales o conflictos dentro de un grupo cercano.',
    },
    FOUR: {
      upright: 'Introspección frente a oportunidades que aún no capturan tu interés.',
      reversed: 'Apertura renovada a posibilidades que antes ignorabas.',
    },
    FIVE: {
      upright: 'Duelo por una pérdida, con la invitación a notar lo que aún queda.',
      reversed: 'Aceptación y el inicio de sanar tras una decepción.',
    },
    SIX: {
      upright: 'Nostalgia y conexión con recuerdos o vínculos del pasado.',
      reversed: 'Necesidad de soltar el pasado para vivir el presente.',
    },
    SEVEN: {
      upright: 'Múltiples opciones que piden claridad antes de decidir.',
      reversed: 'Confusión que empieza a resolverse con una elección más realista.',
    },
    EIGHT: {
      upright: 'Alejarte de algo que ya no te llena, en busca de algo más profundo.',
      reversed: 'Miedo a dejar ir, aunque ya no te sientas satisfecho.',
    },
    NINE: {
      upright: 'Satisfacción y gratitud por el bienestar emocional alcanzado.',
      reversed: 'Complacencia o una satisfacción que se siente superficial.',
    },
    TEN: {
      upright: 'Armonía duradera y felicidad compartida en el hogar o la familia.',
      reversed: 'Tensiones familiares que piden atención honesta.',
    },
    PAGE: {
      upright: 'Sensibilidad y apertura a mensajes o sentimientos nuevos.',
      reversed: 'Inmadurez emocional o dificultad para expresar lo que sientes.',
    },
    KNIGHT: {
      upright: 'Un gesto romántico o una propuesta que llega desde el corazón.',
      reversed: 'Idealización excesiva o promesas que no se sostienen.',
    },
    QUEEN: {
      upright: 'Empatía profunda y una intuición emocional muy afinada.',
      reversed: 'Sobrecarga emocional o dificultad para poner límites.',
    },
    KING: {
      upright: 'Madurez emocional y calma para sostener a otros sin perderte.',
      reversed: 'Represión emocional o cambios de humor difíciles de manejar.',
    },
  },
  SWORDS: {
    ACE: {
      upright: 'Claridad mental y una verdad que se revela con fuerza.',
      reversed: 'Confusión o una idea que aún no termina de aclararse.',
    },
    TWO: {
      upright: 'Una decisión difícil que pide equilibrio entre razón y sentimiento.',
      reversed: 'Indecisión prolongada que empieza a generar tensión.',
    },
    THREE: {
      upright: 'Dolor emocional honesto que, reconocido, permite sanar.',
      reversed: 'Un proceso de sanación que ya está en marcha.',
    },
    FOUR: {
      upright: 'Descanso necesario antes de retomar con más energía.',
      reversed: 'Agotamiento por no haberte permitido pausar a tiempo.',
    },
    FIVE: {
      upright: 'Conflicto donde ganar a toda costa puede salir caro.',
      reversed: 'Reconciliación o el momento de soltar una disputa desgastante.',
    },
    SIX: {
      upright: 'Transición hacia aguas más calmas después de un periodo difícil.',
      reversed: 'Dificultad para dejar atrás una situación que ya pesa.',
    },
    SEVEN: {
      upright: 'Estrategia o discreción; no todo necesita anunciarse de inmediato.',
      reversed: 'Una situación que pide más honestidad de la que ha habido.',
    },
    EIGHT: {
      upright: 'Sensación de estar atrapado por creencias más que por hechos.',
      reversed: 'El inicio de liberarte de una limitación autoimpuesta.',
    },
    NINE: {
      upright: 'Ansiedad o preocupaciones que crecen más en la mente que en la realidad.',
      reversed: 'Alivio gradual al enfrentar directamente lo que te inquieta.',
    },
    TEN: {
      upright: 'El final de un ciclo difícil, con la certeza de que lo peor ya pasó.',
      reversed: 'Resistencia a aceptar que algo ya llegó a su fin.',
    },
    PAGE: {
      upright: 'Curiosidad mental y ganas de investigar antes de actuar.',
      reversed: 'Chismes o información a medias que conviene verificar.',
    },
    KNIGHT: {
      upright: 'Determinación directa para enfrentar un asunto con claridad.',
      reversed: 'Precipitación o palabras dichas sin suficiente cuidado.',
    },
    QUEEN: {
      upright: 'Claridad de pensamiento y honestidad directa, sin rodeos.',
      reversed: 'Frialdad excesiva o crítica que se siente cortante.',
    },
    KING: {
      upright: 'Juicio justo basado en la razón y la experiencia.',
      reversed: 'Rigidez intelectual o uso del poder de forma fría.',
    },
  },
  PENTACLES: {
    ACE: {
      upright: 'Una nueva oportunidad material o financiera que vale la pena explorar.',
      reversed: 'Una oportunidad que se escapa por falta de planeación.',
    },
    TWO: {
      upright: 'Equilibrio entre varias prioridades que exigen tu atención.',
      reversed: 'Dificultad para sostener el equilibrio entre tus responsabilidades.',
    },
    THREE: {
      upright: 'Trabajo en equipo que da frutos gracias a la colaboración.',
      reversed: 'Falta de coordinación o desacuerdos en un proyecto compartido.',
    },
    FOUR: {
      upright: 'Estabilidad y control sobre tus recursos.',
      reversed: 'Apego excesivo al control o miedo a soltar lo material.',
    },
    FIVE: {
      upright: 'Dificultades materiales que ponen a prueba tu red de apoyo.',
      reversed: 'El inicio de una recuperación tras un momento de escasez.',
    },
    SIX: {
      upright: 'Generosidad y un intercambio equilibrado de recursos o ayuda.',
      reversed: 'Desequilibrio en dar o recibir apoyo.',
    },
    SEVEN: {
      upright: 'Paciencia mientras evalúas si el esfuerzo invertido está dando fruto.',
      reversed: 'Impaciencia o dudas sobre si vale la pena seguir invirtiendo tiempo.',
    },
    EIGHT: {
      upright: 'Dedicación y perfeccionamiento constante de una habilidad.',
      reversed: 'Falta de motivación o trabajo hecho sin suficiente cuidado.',
    },
    NINE: {
      upright: 'Independencia y disfrute de lo que has construido con esfuerzo propio.',
      reversed: 'Sensación de aislamiento pese al éxito material.',
    },
    TEN: {
      upright: 'Legado, estabilidad familiar y bienestar a largo plazo.',
      reversed: 'Tensiones familiares relacionadas con dinero o herencia.',
    },
    PAGE: {
      upright: 'Interés genuino en aprender algo nuevo con aplicación práctica.',
      reversed: 'Falta de disciplina para concretar un plan de estudio o trabajo.',
    },
    KNIGHT: {
      upright: 'Constancia y trabajo metódico hacia una meta concreta.',
      reversed: 'Estancamiento por exceso de rutina o rigidez.',
    },
    QUEEN: {
      upright: 'Calidez práctica; cuidas de otros y de ti sin descuidar lo material.',
      reversed: 'Sobrecarga por atender demasiadas responsabilidades a la vez.',
    },
    KING: {
      upright: 'Éxito material sostenido y generosidad desde la abundancia.',
      reversed: 'Materialismo excesivo o rigidez frente al riesgo.',
    },
  },
};

function buildMajorArcana(): TarotCardSeed[] {
  return MAJOR_ARCANA_DATA.map((card, index) => ({
    ...card,
    arcana: 'MAJOR' as const,
    suit: null,
    numberInSuit: null,
    orderIndex: index,
  }));
}

function buildMinorArcana(): TarotCardSeed[] {
  const cards: TarotCardSeed[] = [];
  let orderIndex = MAJOR_ARCANA_DATA.length;

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const meaning = MINOR_MEANINGS[suit.code][rank.code];
      cards.push({
        code: `${suit.code}_${rank.code}`,
        name: `${rank.nameEs} de ${suit.nameEs}`,
        arcana: 'MINOR',
        suit: suit.code,
        numberInSuit: rank.numberInSuit,
        orderIndex: orderIndex++,
        uprightMeaning: meaning.upright,
        reversedMeaning: meaning.reversed,
      });
    }
  }

  return cards;
}

export const TAROT_CARDS: TarotCardSeed[] = [
  ...buildMajorArcana(),
  ...buildMinorArcana(),
];
