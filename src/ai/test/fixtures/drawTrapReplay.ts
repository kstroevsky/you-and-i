import { applyAction, createInitialState } from '@/domain';
import type { Coord, GameState, Player, RuleConfig, TurnAction } from '@/domain/model/types';

const RAW_DRAW_TRAP_REPLAY = `
1. White: Climb B3 -> B4
2. Black: Climb D4 -> D3
3. White: Jump B2 -> D4
4. Black: Climb E4 -> E3
5. White: Jump D1 -> B3
6. Black: Climb F4 -> F3
7. White: Jump D2 -> B2
8. Black: Jump C4 -> E4
9. White: Jump A2 -> C4
10. Black: Climb A4 -> B4
11. White: Jump C2 -> A4
12. White: Jump A4 -> A2
13. White: Jump A2 -> C2
14. Black: Jump B4 -> D2
15. White: Jump B2 -> B4
16. Black: Step to empty D2 -> D1
17. White: Jump C2 -> A4
18. White: Climb A4 -> A5
19. Black: Step to empty E5 -> F4
20. White: Jump C4 -> A4
21. White: Jump A4 -> A2
22. White: Jump A2 -> C4
23. White: Climb C4 -> D3
24. Black: Climb F4 -> F3
25. White: Jump B4 -> D2
26. Black: Climb F3 -> F2
27. White: Jump C3 -> E5
28. Black: Climb F2 -> F1
29. White: Jump D4 -> F4
30. Black: Climb E3 -> E2
31. White: Jump F2 -> D4
32. Black: Climb E2 -> E1
33. White: Climb E5 -> E6
34. Black: Climb F5 -> F4
35. White: Jump E6 -> C4
36. White: Climb C4 -> C5
37. Black: Step to empty F6 -> F5
38. White: Jump E3 -> E5
39. White: Climb E5 -> F4
40. Black: Step to empty E4 -> E3
41. White: Jump F4 -> F6
42. Black: Climb E3 -> E2
43. White: Jump D4 -> B4
44. White: Jump B4 -> B2
45. Black: Step to empty F1 -> F2
46. White: Jump F6 -> F4
47. Black: Split 1 F2 -> F1
48. White: Jump F4 -> F6
49. Black: Jump E2 -> C2
50. Black: Climb C2 -> C1
51. White: Jump B2 -> B4
52. White: Climb B4 -> C5
53. Black: Split 1 F3 -> E2
54. White: Jump C2 -> A4
55. White: Climb A4 -> A5
56. Black: Climb E2 -> F1
57. White: Jump F6 -> F4
58. Black: Step to empty B5 -> B4
59. White: Jump F4 -> F6
60. Black: Step to empty B4 -> C3
61. White: Climb C5 -> C6
62. Black: Step to empty E1 -> E2
63. White: Jump C6 -> E6
64. Black: Split 1 E2 -> E1
65. White: Jump E6 -> C6
66. White: Jump C6 -> E4
67. Black: Split 2 D1 -> C2
68. White: Jump E4 -> C6
69. White: Jump C6 -> E6
70. Black: Climb C2 -> D1
71. White: Jump C2 -> A4
72. White: Climb A4 -> A3
73. Black: Step to empty C3 -> C2
74. White: Jump E6 -> C6
75. White: Climb C6 -> D6
76. Black: Climb C2 -> D1
77. White: Climb B1 -> C1
78. Black: Step to empty B6 -> B5
79. White: Jump D6 -> B6
80. White: Jump B6 -> B4
81. White: Jump B4 -> D4
82. White: Jump D4 -> D6
83. Black: Climb C4 -> B3
84. White: Jump C5 -> E5
85. Black: Step to empty B3 -> B2
86. White: Jump E2 -> C2
87. Black: Step to empty B2 -> B1
88. White: Climb A1 -> B1
89. Black: Unfreeze F5
90. White: Jump F6 -> F4
91. Black: Unfreeze B5
92. White: Jump A5 -> C5
93. Black: Jump A6 -> C4
94. Black: Jump C4 -> E6
95. White: Jump D6 -> F6
96. Black: Step to empty D5 -> D4
97. White: Jump D3 -> D5
98. Black: Unfreeze D4
99. White: Jump C5 -> A5
100. Black: Step to empty D4 -> E3
101. White: Jump F2 -> D4
102. Black: Unfreeze F5
103. White: Jump F6 -> D6
104. White: Jump D6 -> B6
105. White: Climb B6 -> C6
106. Black: Step to empty F5 -> E4
107. White: Jump C6 -> A6
108. White: Jump A6 -> C4
109. Black: Step to empty E6 -> F5
110. White: Jump F4 -> F6
111. Black: Unfreeze E3
112. White: Jump C4 -> A6
113. White: Jump A6 -> C6
114. Black: Climb E4 -> E3
115. White: Jump C6 -> A6
116. White: Jump A6 -> C4
117. White: Step to empty C4 -> B3
118. Black: Step to empty E3 -> E2
119. White: Jump A5 -> C5
120. White: Split 2 C5 -> C6
121. Black: Climb E2 -> E1
122. White: Jump C6 -> C4
123. White: Jump C4 -> A6
124. White: Split 1 A6 -> A5
125. Black: Climb E2 -> E1
126. White: Jump A6 -> C4
127. White: Climb C4 -> D4
128. Black: Unfreeze F5
129. White: Jump F6 -> F4
130. White: Jump F4 -> F2
131. Black: Unfreeze F5
132. White: Step to empty D5 -> C6
133. Black: Step to empty F5 -> E4
134. White: Jump F3 -> D5
135. Black: Unfreeze E4
136. White: Jump D4 -> F4
137. Black: Unfreeze E4
138. White: Jump C6 -> A6
139. White: Jump A6 -> A4
140. White: Jump A4 -> C6
141. White: Jump C6 -> C4
142. White: Step to empty C4 -> D4
143. Black: Step to empty E4 -> E3
144. White: Jump D4 -> D6
145. White: Split 2 D6 -> C6
146. Black: Step to empty E3 -> E2
147. White: Jump C6 -> A6
148. White: Jump A6 -> C4
149. White: Jump C4 -> C6
150. White: Jump C6 -> E6
151. White: Jump E6 -> C4
152. Black: Climb E2 -> F1
153. White: Climb D5 -> D6
154. Black: Unfreeze C5
155. White: Jump C4 -> C6
156. White: Jump C6 -> A4
157. White: Step to empty A4 -> B4
158. Black: Jump B5 -> D5
159. White: Jump D6 -> D4
160. Black: Climb C5 -> B4
161. White: Jump D4 -> D6
162. Black: Step to empty B4 -> C3
163. White: Jump E5 -> C5
164. Black: Step to empty C3 -> B2
165. White: Climb C5 -> D6
166. Black: Jump C5 -> E5
167. White: Jump D6 -> D4
168. White: Jump D4 -> F6
169. Black: Unfreeze D5
170. White: Jump F4 -> D6
171. White: Split 1 D6 -> C6
172. Black: Climb D5 -> E5
173. White: Climb D6 -> C6
174. Black: Step to empty E5 -> E4
175. White: Jump C6 -> A6
176. White: Climb A6 -> B6
177. Black: Step to empty E4 -> D3
178. White: Climb A5 -> A6
179. Black: Step to empty D3 -> C3
180. White: Climb B6 -> A6
181. Black: Step to empty B2 -> A1
182. White: Jump A6 -> C6
183. Black: Step to empty C3 -> B2
184. White: Jump C6 -> A6
185. Black: Split 2 A1 -> A2
186. White: Jump A6 -> C6
187. Black: Climb B2 -> A1
188. White: Jump C6 -> A6
189. Black: Climb B2 -> A1
190. White: Jump A6 -> C6
191. Black: Unfreeze B6
192. White: Jump C6 -> A6
193. Black: Unfreeze B6
194. White: Jump A6 -> C6
195. Black: Unfreeze B6
196. White: Jump C6 -> A6
197. Black: Unfreeze B6
`.trim();

export const DRAW_TRAP_CHECKPOINT_MOVE_NUMBERS = [89, 98, 102, 111, 128, 169, 191] as const;

type ReplayEntry = {
  action: TurnAction;
  actor: Player;
};

function toCoord(value: string): Coord {
  return value as Coord;
}

function parseArrowPayload(payload: string): Coord[] {
  return payload.split(/\s*->\s*/).map(toCoord);
}

function parseAction(description: string): TurnAction {
  if (description.startsWith('Unfreeze ')) {
    return {
      type: 'manualUnfreeze',
      coord: toCoord(description.slice('Unfreeze '.length)),
    };
  }

  if (description.startsWith('Jump ')) {
    const coords = parseArrowPayload(description.slice('Jump '.length));

    return {
      type: 'jumpSequence',
      source: coords[0],
      path: coords.slice(1),
    };
  }

  if (description.startsWith('Climb ')) {
    const [source, target] = parseArrowPayload(description.slice('Climb '.length));

    return {
      type: 'climbOne',
      source,
      target,
    };
  }

  if (description.startsWith('Step to empty ')) {
    const [source, target] = parseArrowPayload(description.slice('Step to empty '.length));

    return {
      type: 'moveSingleToEmpty',
      source,
      target,
    };
  }

  if (description.startsWith('Split 1 ')) {
    const [source, target] = parseArrowPayload(description.slice('Split 1 '.length));

    return {
      type: 'splitOneFromStack',
      source,
      target,
    };
  }

  if (description.startsWith('Split 2 ')) {
    const [source, target] = parseArrowPayload(description.slice('Split 2 '.length));

    return {
      type: 'splitTwoFromStack',
      source,
      target,
    };
  }

  throw new Error(`Unsupported replay action: ${description}`);
}

function parseReplayEntry(line: string): ReplayEntry {
  const match = line.match(/^\d+\.\s+(White|Black):\s+(.+)$/);

  if (!match) {
    throw new Error(`Invalid replay line: ${line}`);
  }

  return {
    action: parseAction(match[2]),
    actor: match[1].toLowerCase() as Player,
  };
}

const DRAW_TRAP_REPLAY = RAW_DRAW_TRAP_REPLAY.split('\n').map(parseReplayEntry);

export const DRAW_TRAP_CHECKPOINTS = DRAW_TRAP_CHECKPOINT_MOVE_NUMBERS.map((moveNumber) => ({
  baitAction: DRAW_TRAP_REPLAY[moveNumber - 1].action,
  moveNumber,
}));

export function createDrawTrapReplayState(
  beforeMoveNumber: number,
  config: RuleConfig,
): GameState {
  let state = createInitialState(config);

  for (const entry of DRAW_TRAP_REPLAY.slice(0, Math.max(0, beforeMoveNumber - 1))) {
    if (state.status === 'gameOver') {
      throw new Error(`Replay ended before move ${beforeMoveNumber}.`);
    }

    if (state.currentPlayer !== entry.actor) {
      throw new Error(
        `Replay actor mismatch before move ${beforeMoveNumber}: expected ${state.currentPlayer}, got ${entry.actor}.`,
      );
    }

    state = applyAction(state, entry.action, config);
  }

  return state;
}
