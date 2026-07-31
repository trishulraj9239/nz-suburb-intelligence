# Model tradeoff eval (TRI-31)

Claude vs open-weight on 12 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 12/12 | 12/12 | 12/12 | 4.6/5 | 6344ms | $0.00166 |
| Qwen 3.6 27B (Groq) | 12/12 | 12/12 | 12/12 | 4.3/5 | 5127ms | $0.00002 |
