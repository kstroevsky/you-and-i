import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';

import { App } from '@/app/App';
import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import { createInitialState } from '@/domain';
import type { SerializableSession } from '@/shared/types/session';
import { createSession, resetFactoryIds } from '@/test/factories';

function renderApp(session = createSession(createInitialState())) {
  return render(
    <GameStoreProvider initialSession={session}>
      <App />
    </GameStoreProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  it('reveals localized legal move buttons after selecting a cell', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(screen.getByRole('button', { name: 'Восхождение' })).toBeInTheDocument();
  });

  it('switches the interface language globally, including the instructions tab', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText('Local hot-seat play on one screen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell A1' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Instructions' }));

    expect(screen.getByRole('heading', { name: 'Canonical instructions' })).toBeInTheDocument();
    expect(screen.getByText('Precise game instruction - English')).toBeInTheDocument();
  });

  it('keeps the game state when switching between the game and instructions tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('tab', { name: 'Инструкция' }));

    expect(screen.getByRole('heading', { name: 'Каноническая инструкция' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(screen.getByText('Белые: Восхождение A1 -> B2')).toBeInTheDocument();
    expect(screen.getByText('Чёрные ходят')).toBeInTheDocument();
  });

  it('shows clickable glossary tooltips for gameplay terms', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Подробнее: Восхождение' }));

    expect(
      screen.getByText(/Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку/i),
    ).toBeInTheDocument();
  });

  it('clears the current move selection when rule toggles change', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('checkbox', { name: 'Базовый подсчёт' }));

    expect(screen.queryByText(/Выбранная клетка/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Выберите шашку или свою горку, чтобы увидеть ходы.'),
    ).toBeInTheDocument();
  });

  it('locks move input when the game is over', async () => {
    const user = userEvent.setup();
    const session: SerializableSession = createSession({
      ...createInitialState(),
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });

    renderApp(session);

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(screen.getAllByText('Ничья по трёхкратному повторению')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
  });

  it('supports history back/forward, fogged future moves, and click-to-travel', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    await user.click(screen.getByRole('button', { name: 'Клетка F6' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка E5' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    const historyList = screen.getByRole('list');
    expect(historyList).toHaveClass('history-list');

    const backButton = screen.getByRole('button', { name: 'Назад' });
    const forwardButton = screen.getByRole('button', { name: 'Вперёд' });

    expect(backButton).toBeEnabled();
    expect(forwardButton).toBeDisabled();

    await user.click(backButton);

    expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 1')).toBeInTheDocument();
    expect(forwardButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' })).toHaveClass(
      'history-item--future',
    );

    await user.click(screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' }));

    expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Белые: Восхождение A1 -> B2' }));

    expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
  });
});
