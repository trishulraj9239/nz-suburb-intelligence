# Model tradeoff eval (TRI-31)

Claude vs open-weight on 28 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 28/28 | 28/28 | 28/28 | 28/28 | 4.8/5 (28/28 judged) | 7679ms | $0.00238 |
| Qwen 3.6 27B (Groq) | 28/28 | 28/28 | 27/28 | 28/28 | 4.4/5 (28/28 judged) | 9568ms | $0.00002 |
