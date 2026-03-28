import type { Language } from '@/shared/i18n/types';

export type GlossaryTermId =
  | 'jumpSequence'
  | 'manualUnfreeze'
  | 'climbOne'
  | 'moveSingleToEmpty'
  | 'splitOneFromStack'
  | 'splitTwoFromStack'
  | 'friendlyStackTransfer'
  | 'threefoldDraw'
  | 'scoreMode'
  | 'homeFieldVictory'
  | 'sixStacksVictory'
  | 'homeFieldSingles'
  | 'controlledStacks'
  | 'frontRowStacks'
  | 'frozenEnemySingles'
  | 'passDeviceOverlay';

type GlossaryEntry = {
  title: Record<Language, string>;
  description: Record<Language, string>;
};

const GLOSSARY: Record<GlossaryTermId, GlossaryEntry> = {
  jumpSequence: {
    title: {
      english: 'Jump',
      russian: 'Прыжок',
      ukrainian: 'Стрибок',
    },
    description: {
      english:
        'A jump is applied one segment at a time over single checkers, including frozen singles, into empty cells. Frozen checkers thaw when jumped, and if another segment is available the same player keeps the turn and may either continue jumping or make any other legal move.',
      russian:
        'Прыжок применяется по одному участку через одиночные шашки, включая замороженные, на пустые клетки. Замороженные шашки оттаивают после такого прыжка, и если следующий участок доступен, тот же игрок сохраняет ход и может либо продолжить прыжок, либо сделать любой другой допустимый ход.',
      ukrainian:
        'Стрибок застосовується по одній ділянці через одиночні шашки, включаючи заморожені, на порожні клітинки. Заморожені шашки відтають після такого стрибка, і якщо наступна ділянка доступна, той же гравець зберігає хід і може або продовжити стрибати, або зробити будь-який інший допустимий хід.',
    },
  },
  manualUnfreeze: {
    title: {
      english: 'Manual unfreeze',
      russian: 'Ручная разморозка',
      ukrainian: 'Ручна розморозка',
    },
    description: {
      english: 'Spend the whole turn to make one of your frozen single checkers active again.',
      russian: 'Потратить весь ход, чтобы снова сделать активной одну свою замороженную одиночную шашку.',
      ukrainian: 'Витратити весь хід, щоб знову зробити активною одну свою заморожену одиночну шашку.',
    },
  },
  climbOne: {
    title: {
      english: 'Climb',
      russian: 'Восхождение',
      ukrainian: 'Сходження',
    },
    description: {
      english: 'Move one active top checker onto an adjacent active occupied cell to build or change a stack.',
      russian: 'Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку, чтобы создать горку или сменить контроль.',
      ukrainian: 'Перенести одну активну верхню шашку на сусідню зайняту активну клітинку, щоб створити гірку або змінити контроль.',
    },
  },
  moveSingleToEmpty: {
    title: {
      english: 'Step to empty',
      russian: 'Шаг на пустую',
      ukrainian: 'Крок на порожню',
    },
    description: {
      english: 'Move an active single checker or a controlled stack exactly one cell in any direction onto an adjacent empty cell.',
      russian: 'Переместить активную одиночную шашку или контролируемую горку ровно на одну клетку в любом направлении на соседнюю пустую клетку.',
      ukrainian: 'Перемістити активну одиночну шашку або контрольовану гірку рівно на одну клітинку в будь-якому напрямку на сусідню порожню клітинку.',
    },
  },
  splitOneFromStack: {
    title: {
      english: 'Split one',
      russian: 'Сход одной',
      ukrainian: 'Схід однієї',
    },
    description: {
      english: 'Move only the top checker from your controlled stack to one adjacent cell.',
      russian: 'Снять только верхнюю шашку со своей горки и перенести её на соседнюю клетку.',
      ukrainian: 'Зняти тільки верхню шашку зі своєї гірки та перенести її на сусідню клітинку.',
    },
  },
  splitTwoFromStack: {
    title: {
      english: 'Split two',
      russian: 'Сход двумя',
      ukrainian: 'Схід двома',
    },
    description: {
      english: 'Move the top two checkers together from your controlled stack onto an adjacent empty cell.',
      russian: 'Снять две верхние шашки вместе со своей горки и поставить их на соседнюю пустую клетку.',
      ukrainian: 'Зняти дві верхні шашки разом зі своєї гірки і поставити їх на сусідню порожню клітинку.',
    },
  },
  friendlyStackTransfer: {
    title: {
      english: 'Friendly stack transfer',
      russian: 'Перенос на свою горку',
      ukrainian: 'Перенесення на свою гірку',
    },
    description: {
      english: 'Optional rule: move exactly one top checker from one controlled stack to another controlled friendly stack anywhere on the board.',
      russian: 'Необязательное правило: перенести ровно одну верхнюю шашку с одной своей контролируемой горки на другую свою горку в любой точке поля.',
      ukrainian: 'Необов\'язкове правило: перенести рівно одну верхню шашку з однієї своєї контрольованої гірки на іншу свою гірку в будь-якій точці поля.',
    },
  },
  threefoldDraw: {
    title: {
      english: 'Threefold repetition',
      russian: 'Троекратное повторение',
      ukrainian: 'Триразове повторення',
    },
    description: {
      english:
        'Optional trigger rule: when the same full position with the same side to move appears for the third time, draw-resolution tiebreak is applied (own home-field checkers, then completed home stacks, then draw if still equal).',
      russian:
        'Необязательное правило-триггер: когда одна и та же полная позиция с тем же игроком на ходу встречается в третий раз, применяется тай-брейк разрешения ничьей (свои шашки на своём поле, затем завершённые домашние горки, затем ничья при полном равенстве).',
      ukrainian:
        'Необов\'язкове правило-тригер: коли одна й та сама повна позиція з тим же гравцем на ходу зустрічається втретє, застосовується тай-брейк вирішення нічиєї (свої шашки на своєму полі, потім завершені домашні гірки, потім нічия за повної рівності).',
    },
  },
  scoreMode: {
    title: {
      english: 'Score mode',
      russian: 'Режим подсчёта',
      ukrainian: 'Режим підрахунку',
    },
    description: {
      english: 'Informational metrics only. It does not change move legality or victory conditions.',
      russian: 'Только информационные показатели. На допустимость ходов и условия победы этот режим не влияет.',
      ukrainian: 'Тільки інформаційні показники. На допустимість ходів та умови перемоги цей режим не впливає.',
    },
  },
  homeFieldVictory: {
    title: {
      english: 'Home-field victory',
      russian: 'Победа через своё поле',
      ukrainian: 'Перемога через своє поле',
    },
    description: {
      english: 'You win immediately when all 18 of your checkers stand as single checkers on your home rows.',
      russian: 'Вы сразу побеждаете, когда все 18 ваших шашек стоят по одной на ваших домашних рядах.',
      ukrainian: 'Ви відразу перемагаєте, коли всі 18 ваших шашок стоять по одній на ваших домашніх рядах.',
    },
  },
  sixStacksVictory: {
    title: {
      english: 'Six-stack victory',
      russian: 'Победа шестью горками',
      ukrainian: 'Перемога шістьма гірками',
    },
    description: {
      english: 'You win immediately when you control six height-3 stacks on the front row of your home field.',
      russian: 'Вы сразу побеждаете, когда контролируете шесть горок высоты 3 на переднем ряду своего поля.',
      ukrainian: 'Ви відразу перемагаєте, коли контролюєте шість гірок висоти 3 на передньому ряду свого поля.',
    },
  },
  homeFieldSingles: {
    title: {
      english: 'Home singles',
      russian: 'Одиночные на своём поле',
      ukrainian: 'Одиночні на своєму полі',
    },
    description: {
      english: 'How many of your single checkers already stand on your home rows.',
      russian: 'Сколько ваших одиночных шашек уже стоит на ваших домашних рядах.',
      ukrainian: 'Скільки ваших одиночних шашок вже стоїть на ваших домашніх рядах.',
    },
  },
  controlledStacks: {
    title: {
      english: 'Controlled stacks',
      russian: 'Контролируемые горки',
      ukrainian: 'Контрольовані гірки',
    },
    description: {
      english: 'Stacks count for the player whose checker is on top.',
      russian: 'Горка считается вашей, если сверху лежит ваша шашка.',
      ukrainian: 'Гірка вважається вашою, якщо зверху лежить ваша шашка.',
    },
  },
  frontRowStacks: {
    title: {
      english: 'Front-row 3-stacks',
      russian: 'Горки 3 на переднем ряду',
      ukrainian: 'Гірки 3 на передньому ряду',
    },
    description: {
      english: 'Height-3 stacks you control on A6-F6 for White or A1-F1 for Black.',
      russian: 'Горки высоты 3 под вашим контролем на A6-F6 для белых или A1-F1 для чёрных.',
      ukrainian: 'Гірки висоти 3 під вашим контролем на A6-F6 для білих або A1-F1 для чорних.',
    },
  },
  frozenEnemySingles: {
    title: {
      english: 'Frozen enemy singles',
      russian: 'Замороженные чужие одиночные',
      ukrainian: 'Заморожені чужі одиночні',
    },
    description: {
      english: 'Enemy single checkers currently frozen by your jumps.',
      russian: 'Чужие одиночные шашки, которые сейчас заморожены после ваших прыжков.',
      ukrainian: 'Чужі одиночні шашки, які зараз заморожені після ваших стрибків.',
    },
  },
  passDeviceOverlay: {
    title: {
      english: 'Pass-device overlay',
      russian: 'Экран передачи устройства',
      ukrainian: 'Екран передачі пристрою',
    },
    description: {
      english: 'Hot-seat privacy screen shown between turns so players can hand over the device cleanly.',
      russian: 'Экран для hot-seat режима между ходами, чтобы игроки спокойно передавали устройство друг другу.',
      ukrainian: 'Екран для hot-seat режиму між ходами, щоб гравці спокійно передавали пристрій одне одному.',
    },
  },
};

/** Returns localized glossary title/description pair for tooltips and contextual help UI. */
export function getGlossaryEntry(termId: GlossaryTermId, language: Language): { title: string; description: string } {
  return {
    title: GLOSSARY[termId].title[language],
    description: GLOSSARY[termId].description[language],
  };
}
