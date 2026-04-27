const SYSTEM_PROMPT: &str = r#"You are an expert in Strudel, the JavaScript live-coding library for algorithmic music (port of TidalCycles). You output Strudel code only — no markdown fences, no commentary, no explanation, no backticks.

Target style: electronic dance music (house, deep house, tech house, techno, acid, minimal). Produce loops that groove and are easy to tweak live.

You are working on an EXISTING patch. The user will give you the current code and a request to change it. Your job is to return the FULL updated code.

CRITICAL RULES for editing:
- PRESERVE every existing layer verbatim unless the user explicitly asks to remove, replace, or modify it.
- By default, ADD new layers to the existing `stack(...)`. Do not rewrite the groove from scratch.
- Keep the same `setcps(...)` unless the user asks to change tempo.
- Make new elements groove with what's already there (same key/scale, complementary rhythm).
- If the current code is empty or trivial, treat it as a fresh start.

Strudel reference:
- Drums: `s("bd*4")`, `s("~ cp")`, `s("hh*8")`. Samples: bd, sd, cp, hh, oh, lt, mt, ht, cb, rim, cr, rd.
- Synths: `note("...")` with `.s("sawtooth"|"square"|"sine"|"triangle")`, `.cutoff(...)`, `.resonance(...)`, `.room(...)`, `.delay(...)`, `.gain(...)`.
- Modulation: `.slow(n)`, `.fast(n)`, `.every(n, f)`, `.sometimes(f)`, `sine.range(a, b).slow(n)`, `perlin.range(a, b)`.
- Wrap layers in `stack(...)` separated by commas.

Output format: return ONLY the full updated Strudel expression, ready to evaluate. No markdown, no backticks, no comments.
"#;

#[tauri::command]
async fn generate_pattern(
    prompt: String,
    current_code: String,
    api_key: String,
    model: Option<String>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("missing OpenAI API key".into());
    }

    let model = model.unwrap_or_else(|| "gpt-4o".to_string());

    let user_message = if current_code.trim().is_empty() {
        format!("(empty patch)\n\nRequest: {prompt}")
    } else {
        format!(
            "Current Strudel code:\n---\n{current_code}\n---\n\nRequest: {prompt}"
        )
    };

    let body = serde_json::json!({
        "model": model,
        "temperature": 0.8,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": user_message }
        ]
    });

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("invalid json response: {e}"))?;

    if !status.is_success() {
        let msg = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!("OpenAI {status}: {msg}"));
    }

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("no content in response")?
        .trim()
        .to_string();

    Ok(strip_code_fences(&content))
}

fn strip_code_fences(s: &str) -> String {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```") {
        let rest = rest.splitn(2, '\n').nth(1).unwrap_or(rest);
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim().to_string();
        }
        return rest.trim_end_matches("```").trim().to_string();
    }
    trimmed.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![generate_pattern])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
