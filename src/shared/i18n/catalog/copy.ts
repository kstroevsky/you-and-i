import type { Language } from '@/shared/i18n/types';

import { TEXT } from '@/shared/i18n/catalog/text';

export type InteractionCopy = {
  idle: string;
  pieceSelected: (source: string) => string;
  jumpFollowUp: (source: string) => string;
  choosingTarget: (actionLabel: string, source: string) => string;
  buildingJumpChain: (source: string) => string;
  turnResolved: (nextPlayerLabel: string) => string;
  passingDevice: (nextPlayerLabel: string) => string;
  gameOver: string;
};

export const INTERACTION_COPY: Record<Language, InteractionCopy> = {
  english: {
    idle: 'Select a checker or controlled stack.',
    pieceSelected: (source) => `Selected ${source}. Choose a move type.`,
    jumpFollowUp: (source) =>
      `Jump chain ready at ${source}. Continue with that checker or stack.`,
    choosingTarget: (action, source) => `Choose a target for ${action} from ${source}.`,
    buildingJumpChain: (source) =>
      `Choose the next jump landing from ${source}. Each click applies one segment immediately.`,
    turnResolved: (nextPlayer) => `Turn resolved. ${nextPlayer} is next.`,
    passingDevice: (nextPlayer) => `Pass the device to ${nextPlayer}.`,
    gameOver: 'Game over.',
  },
  russian: {
    idle: 'Выберите шашку или контролируемую горку.',
    pieceSelected: (source) => `Выбрана ${source}. Теперь выберите тип хода.`,
    jumpFollowUp: (source) =>
      `Цепочка прыжков готова из ${source}. Продолжайте этой же шашкой или горкой.`,
    choosingTarget: (action, source) => `Выберите цель для «${action}» из ${source}.`,
    buildingJumpChain: (source) =>
      `Выберите следующую цель прыжка из ${source}. Каждый клик применяет один участок сразу.`,
    turnResolved: (nextPlayer) => `Ход завершён. Дальше ходят ${nextPlayer.toLowerCase()}.`,
    passingDevice: (nextPlayer) =>
      `Передайте устройство: ходят ${nextPlayer.toLowerCase()}.`,
    gameOver: 'Игра окончена.',
  },
  ukrainian: {
    idle: 'Оберіть шашку або контрольовану гірку.',
    pieceSelected: (source) => `Обрана ${source}. Тепер оберіть тип ходу.`,
    jumpFollowUp: (source) =>
      `Ланцюжок стрибків готовий із ${source}. Продовжуйте цією ж шашкою або гіркою.`,
    choosingTarget: (action, source) => `Оберіть ціль для «${action}» із ${source}.`,
    buildingJumpChain: (source) =>
      `Оберіть наступну ціль стрибка із ${source}. Кожен клік застосовує одну ділянку одразу.`,
    turnResolved: (nextPlayer) => `Хід завершено. Далі ходять ${nextPlayer.toLowerCase()}.`,
    passingDevice: (nextPlayer) =>
      `Передайте пристрій: ходять ${nextPlayer.toLowerCase()}.`,
    gameOver: 'Гру завершено.',
  },
};

export type VictoryCopy = {
  none: string;
  homeField: (winner: string) => string;
  sixStacks: (winner: string) => string;
  threefoldTiebreakWin: (
    winner: string,
    ownFieldWhite: number,
    ownFieldBlack: number,
    stacksWhite: number,
    stacksBlack: number,
    decidedBy: 'checkers' | 'stacks',
  ) => string;
  stalemateTiebreakWin: (
    winner: string,
    ownFieldWhite: number,
    ownFieldBlack: number,
    stacksWhite: number,
    stacksBlack: number,
    decidedBy: 'checkers' | 'stacks',
  ) => string;
  threefoldDraw: string;
  stalemateDraw: string;
};

export const VICTORY_COPY: Record<Language, VictoryCopy> = {
  english: {
    none: TEXT.english.gameActive,
    homeField: (winner) => `${winner} win by home field`,
    sixStacks: (winner) => `${winner} win by six stacks`,
    threefoldTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} win after threefold tiebreak (${decidedBy === 'checkers' ? 'decided by own-field checkers' : 'decided by completed home stacks'}). Own-field checkers: White ${ownFieldWhite}, Black ${ownFieldBlack}. Completed home stacks: White ${stacksWhite}, Black ${stacksBlack}.`,
    stalemateTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} win after stalemate tiebreak (${decidedBy === 'checkers' ? 'decided by own-field checkers' : 'decided by completed home stacks'}). Own-field checkers: White ${ownFieldWhite}, Black ${ownFieldBlack}. Completed home stacks: White ${stacksWhite}, Black ${stacksBlack}.`,
    threefoldDraw: 'Draw by threefold repetition',
    stalemateDraw: 'Draw by stalemate',
  },
  russian: {
    none: TEXT.russian.gameActive,
    homeField: (winner) => `${winner} победили через своё поле`,
    sixStacks: (winner) => `${winner} победили шестью горками`,
    threefoldTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} победили по тай-брейку после трёхкратного повторения (${decidedBy === 'checkers' ? 'решение по шашкам на своём поле' : 'решение по завершённым домашним горкам'}). Шашки на своём поле: белые ${ownFieldWhite}, чёрные ${ownFieldBlack}. Завершённые домашние горки: белые ${stacksWhite}, чёрные ${stacksBlack}.`,
    stalemateTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} победили по тай-брейку при блокировке (${decidedBy === 'checkers' ? 'решение по шашкам на своём поле' : 'решение по завершённым домашним горкам'}). Шашки на своём поле: белые ${ownFieldWhite}, чёрные ${ownFieldBlack}. Завершённые домашние горки: белые ${stacksWhite}, чёрные ${stacksBlack}.`,
    threefoldDraw: 'Ничья по трёхкратному повторению',
    stalemateDraw: 'Ничья по блокировке',
  },
  ukrainian: {
    none: TEXT.ukrainian.gameActive,
    homeField: (winner) => `${winner} перемогли через своє поле`,
    sixStacks: (winner) => `${winner} перемогли шістьма гірками`,
    threefoldTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} перемогли за тай-брейком після триразового повторення (${decidedBy === 'checkers' ? 'рішення за шашками на своєму полі' : 'рішення за завершеними домашніми гірками'}). Шашки на своєму полі: білі ${ownFieldWhite}, чорні ${ownFieldBlack}. Завершені домашні гірки: білі ${stacksWhite}, чорні ${stacksBlack}.`,
    stalemateTiebreakWin: (
      winner,
      ownFieldWhite,
      ownFieldBlack,
      stacksWhite,
      stacksBlack,
      decidedBy,
    ) =>
      `${winner} перемогли за тай-брейком при блокуванні (${decidedBy === 'checkers' ? 'рішення за шашками на своєму полі' : 'рішення за завершеними домашніми гірками'}). Шашки на своєму полі: білі ${ownFieldWhite}, чорні ${ownFieldBlack}. Завершені домашні гірки: білі ${stacksWhite}, чорні ${stacksBlack}.`,
    threefoldDraw: 'Нічия за триразовим повторенням',
    stalemateDraw: 'Нічия за блокуванням',
  },
};

export type ResultTitleCopy = {
  winner: (winner: string) => string;
  draw: string;
  gameOver: string;
};

export const RESULT_TITLE_COPY: Record<Language, ResultTitleCopy> = {
  english: {
    winner: (winner) => `${winner} win`,
    draw: 'Draw',
    gameOver: 'Game over',
  },
  russian: {
    winner: (winner) => `${winner} победили`,
    draw: 'Ничья',
    gameOver: 'Игра окончена',
  },
  ukrainian: {
    winner: (winner) => `${winner} перемогли`,
    draw: 'Нічия',
    gameOver: 'Гру завершено',
  },
};

export type MiscCopy = {
  turnBanner: (player: string) => string;
  passOverlayLabel: (player: string) => string;
  historySummary: (count: number, cursor: number) => string;
  tooltipMoreAbout: (title: string) => string;
  autoPassPrefix: string;
};

export const MISC_COPY: Record<Language, MiscCopy> = {
  english: {
    turnBanner: (player) => `${player} turn`,
    passOverlayLabel: (player) => `Pass the device to ${player}.`,
    historySummary: (count, cursor) => `Total: ${count} · History cursor: ${cursor}`,
    tooltipMoreAbout: (title) => `More about ${title}`,
    autoPassPrefix: ' | auto-pass: ',
  },
  russian: {
    turnBanner: (player) => `${player} ходят`,
    passOverlayLabel: (player) => `Передайте устройство: ${player.toLowerCase()}.`,
    historySummary: (count, cursor) => `Всего: ${count} · Позиция истории: ${cursor}`,
    tooltipMoreAbout: (title) => `Подробнее: ${title}`,
    autoPassPrefix: ' | автопас: ',
  },
  ukrainian: {
    turnBanner: (player) => `${player} ходять`,
    passOverlayLabel: (player) => `Передайте пристрій: ${player.toLowerCase()}.`,
    historySummary: (count, cursor) => `Всього: ${count} · Позиція історії: ${cursor}`,
    tooltipMoreAbout: (title) => `Детальніше: ${title}`,
    autoPassPrefix: ' | автопас: ',
  },
};
