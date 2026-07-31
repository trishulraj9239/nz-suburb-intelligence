# Model tradeoff eval (TRI-31)

Claude vs open-weight on 10 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 10/10 | 10/10 | 10/10 | 4.9/5 | 6176ms | $0.00137 |
| Qwen 3.6 27B (Groq) | 10/10 | 9/10 | 10/10 | 4.4/5 | 6661ms | $0.00002 |
