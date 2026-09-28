# Model tradeoff eval (TRI-31)

Claude vs open-weight on 64 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 64/64 | 64/64 | 62/64 | 64/64 | 4.8/5 (64/64 judged) | 7802ms | $0.00209 |
| Qwen 3.8 27B (Groq) | 42/64 | 63/64 | 64/64 | 64/64 | 3.4/5 (64/64 judged) | 27295ms | $0.00002 |
