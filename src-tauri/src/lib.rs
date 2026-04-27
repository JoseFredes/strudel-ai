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

const EXPLAIN_PROMPT: &str = "You are an expert in Strudel live-coding. \
Explain what the following Strudel code does, in Spanish, for a musician who may not be a programmer. \
Be concise (2–4 sentences). Describe the rhythm, sounds, character, and BPM if you can infer it.";

const SUGGEST_PROMPT: &str = r#"You are a creative music director for electronic music. Analyze the given Strudel pattern and suggest 4 specific, DIFFERENT directions to take it. Each suggestion must be unique and tailored to THIS specific pattern — not generic advice.

Rules:
- Labels must be 1-3 words and SPECIFIC to this pattern (e.g. "sub bass in", "halve kick", "chord stab", "cut to mono"), NOT generic (never use: darker, acid, strip back, swing, reverb, faster, slower — those are already template buttons)
- Prompts must reference actual elements in the current code (specific notes, sounds, BPM, structure)
- Each of the 4 suggestions must explore a DIFFERENT dimension: rhythm, harmony, texture, structure — vary them
- Be bold and surprising, not obvious

Return ONLY a JSON array of exactly 4 objects: [{"label": "...", "prompt": "..."}, ...]
No markdown, no extra text."#;

async fn call_openai(api_key: &str, body: &serde_json::Value) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("invalid json response: {e}"))?;

    if !status.is_success() {
        let msg = json["error"]["message"]
            .as_str()
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

fn make_user_message(prompt: &str, current_code: &str) -> String {
    if current_code.trim().is_empty() {
        format!("(empty patch)\n\nRequest: {prompt}")
    } else {
        format!("Current Strudel code:\n---\n{current_code}\n---\n\nRequest: {prompt}")
    }
}

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
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.8,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": make_user_message(&prompt, &current_code) }
        ]
    });
    call_openai(&api_key, &body).await
}

#[tauri::command]
async fn explain_pattern(
    code: String,
    api_key: String,
    model: Option<String>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("missing OpenAI API key".into());
    }
    let model = model.unwrap_or_else(|| "gpt-4o".to_string());
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.3,
        "messages": [
            { "role": "system", "content": EXPLAIN_PROMPT },
            { "role": "user", "content": format!("```\n{code}\n```") }
        ]
    });
    call_openai(&api_key, &body).await
}

async fn make_variation(
    prompt: &str,
    current_code: &str,
    api_key: &str,
    model: &str,
    temperature: f64,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "temperature": temperature,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": make_user_message(prompt, current_code) }
        ]
    });
    call_openai(api_key, &body).await
}

#[tauri::command]
async fn generate_variations(
    prompt: String,
    current_code: String,
    api_key: String,
    model: Option<String>,
) -> Result<Vec<String>, String> {
    if api_key.trim().is_empty() {
        return Err("missing OpenAI API key".into());
    }
    let model = model.unwrap_or_else(|| "gpt-4o".to_string());
    let (a, b, c) = tokio::join!(
        make_variation(&prompt, &current_code, &api_key, &model, 0.7),
        make_variation(&prompt, &current_code, &api_key, &model, 0.9),
        make_variation(&prompt, &current_code, &api_key, &model, 1.1),
    );
    Ok(vec![a?, b?, c?])
}

#[tauri::command]
async fn suggest_directions(
    code: String,
    api_key: String,
    model: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    if api_key.trim().is_empty() {
        return Err("missing OpenAI API key".into());
    }
    let model = model.unwrap_or_else(|| "gpt-4o".to_string());
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.9,
        "messages": [
            { "role": "system", "content": SUGGEST_PROMPT },
            { "role": "user", "content": format!("Current pattern:\n```\n{code}\n```") }
        ]
    });
    let raw = call_openai(&api_key, &body).await?;
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid suggestions json: {e}"))?;
    Ok(parsed)
}

#[tauri::command]
async fn save_patch_dialog(content: String) -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("Strudel patch", &["strudel"])
        .set_file_name("patch.strudel")
        .save_file()
        .await;
    if let Some(file) = handle {
        tokio::fs::write(file.path(), content.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        Ok(Some(file.file_name()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn open_patch_dialog() -> Result<Option<(String, String)>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("Strudel patch", &["strudel"])
        .pick_file()
        .await;
    if let Some(file) = handle {
        let name = file
            .file_name()
            .trim_end_matches(".strudel")
            .to_string();
        let content = tokio::fs::read_to_string(file.path())
            .await
            .map_err(|e| e.to_string())?;
        Ok(Some((name, content)))
    } else {
        Ok(None)
    }
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
        .invoke_handler(tauri::generate_handler![
            generate_pattern,
            explain_pattern,
            generate_variations,
            suggest_directions,
            save_patch_dialog,
            open_patch_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
