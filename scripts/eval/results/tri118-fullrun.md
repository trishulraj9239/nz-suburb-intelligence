# Model tradeoff eval (TRI-31)

Claude vs open-weight on 31 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 31/31 | 31/31 | 31/31 | 31/31 | 4.6/5 (31/31 judged) | 7317ms | $0.00244 |
| Qwen 3.6 27B (Groq) | 0/31 | 31/31 | 31/31 | 31/31 | 1.1/5 (31/31 judged) | 283ms | $0.00000 |
