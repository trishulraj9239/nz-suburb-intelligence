# Model tradeoff eval (TRI-31)

Claude vs open-weight on 27 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 27/27 | 27/27 | 27/27 | 4.5/5 | 8102ms | $0.00236 |
| Qwen 3.6 27B (Groq) | 5/27 | 26/27 | 27/27 | 1.5/5 | 34282ms | $0.00001 |
