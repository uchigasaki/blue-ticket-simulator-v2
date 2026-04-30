const DATA = window.APP_DATA;
const CONFIG = window.APP_CONFIG || {};

let state = {
  lang: "ja",
  screen: "language",
  participantId: "",
  email: "",
  consent: false,
  sessionId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
  preSurveyAnswers: {},
  postSurveyAnswers: {},
  introIndex: 0,
  qIndex: 0,
  selected: null,
  score: 0,
  answers: [],
  questionStartedAt: null,
  sessionStartedAt: new Date().toISOString(),
  completedAt: null,
  postSurveyCompletedAt: null,
  submissionStatus: "idle",
  submissionMessage: "",
  error: ""
};

const app = document.getElementById("app");
const t = (key) => DATA.ui[state.lang][key] || key;
const textOf = (obj) => typeof obj === "string" ? obj : obj?.[state.lang] || obj?.ja || "";
const $ = (s) => document.querySelector(s);
const SCALE_VALUES = [1,2,3,4];
const DEFAULT_SCALE_LABELS = {
  ja: ["まったくそう思わない", "あまりそう思わない", "ややそう思う", "とてもそう思う"],
  en: ["Strongly disagree", "Somewhat disagree", "Somewhat agree", "Strongly agree"]
};
const CATEGORY_META = {
  road_position: {
    ja: ["走行位置", "車道・歩道・左側通行の判断"],
    en: ["Road Position", "Roadway, sidewalk, and left-side riding"]
  },
  pedestrian_priority: {
    ja: ["歩行者配慮", "歩道・横断者を妨げない判断"],
    en: ["Pedestrian Priority", "Avoiding obstruction of pedestrians"]
  },
  hazard_prediction: {
    ja: ["危険予測", "事故につながる兆候への気づき"],
    en: ["Hazard Prediction", "Recognizing situations that can lead to crashes"]
  },
  system_process: {
    ja: ["制度理解", "対象年齢・手続・講習の理解"],
    en: ["System Knowledge", "Age, procedures, and training system"]
  }
};
const QUESTION_CATEGORY = {
  q1: "road_position",
  q2: "pedestrian_priority",
  q3: "hazard_prediction",
  q4: "hazard_prediction",
  q5: "hazard_prediction",
  q6: "road_position",
  q7: "hazard_prediction",
  q8: "hazard_prediction",
  q9: "hazard_prediction",
  q10: "system_process",
  q11: "system_process",
  q12: "system_process"
};

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function csvEscape(v){
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function correctValue(q){
  if(q.type === "classify") return Object.entries(q.correct_groups).map(([k,v])=>`${k}:${groupLabel(q, v)}`).join("; ");
  if(Array.isArray(q.correct)) return q.correct.join("|");
  return q.correct;
}
function groupLabel(q, groupKey){
  return textOf(q.group_labels?.[groupKey]) || groupKey;
}
function selectedValue(sel, q=null){
  if(Array.isArray(sel)) return sel.join("|");
  if(sel && typeof sel === "object") return Object.entries(sel).map(([k,v])=>`${k}:${q ? groupLabel(q, v) : v}`).join("; ");
  return sel || "";
}
function setScreen(screen){
  state.screen = screen;
  state.error = "";
  render();
  window.scrollTo({top:0, behavior:"smooth"});
}
function layout(content, progressText=""){
  const ui = DATA.ui[state.lang];
  const footer = state.lang === "ja"
    ? "研究用プロトタイプ：回答ログは同意に基づき記録します。Google Sheets連携が未設定の場合はCSVで保存してください。"
    : "Research prototype: answers are recorded with consent. If Google Sheets integration is not configured, save the CSV.";
  return `
  <main class="site">
    <header class="header">
      <div class="brand">
        <h1>${escapeHtml(ui.appTitle)}</h1>
        <p>${escapeHtml(ui.subtitle)}</p>
      </div>
      ${progressText ? `<div class="badge">${escapeHtml(progressText)}</div>` : ""}
    </header>
    ${content}
    <div class="footer-note">${escapeHtml(footer)}</div>
  </main>`;
}
function render(){
  if(state.screen === "language") return renderLanguage();
  if(state.screen === "pre") return renderPreSurvey();
  if(state.screen === "intro") return renderIntro();
  if(state.screen === "question") return renderQuestion();
  if(state.screen === "feedback") return renderFeedback();
  if(state.screen === "result") return renderResult();
  if(state.screen === "post") return renderPostSurvey();
  if(state.screen === "final") return renderFinal();
}

function renderLanguage(){
  app.innerHTML = layout(`
    <section class="card center stack">
      <div class="theme">Bicycle Blue Ticket Simulator 2026</div>
      <h2 class="title">言語を選択してください / Choose your language</h2>
      <p class="notice">${escapeHtml(state.lang === "ja" ? "事前アンケート，場面判断シミュレーション，結果表示，事後アンケートまでを同じサイト内で行います。" : "This prototype includes the pre-survey, situation judgment simulation, result view, and post-survey in the same site.")}</p>
      <div class="row">
        <button class="btn" onclick="chooseLang('ja')">日本語で開始</button>
        <button class="btn secondary" onclick="chooseLang('en')">Start in English</button>
      </div>
    </section>
  `);
}
function chooseLang(lang){
  state.lang = lang;
  document.documentElement.lang = lang;
  setScreen("pre");
}

function renderSurveyFields(items, answers, prefix=""){
  return items.map((q,idx)=>{
    const value = answers[q.id] || "";
    const name = `${prefix}${q.id}`;
    if(q.type === "single"){
      return `<div class="card"><div class="theme">Q${idx+1}</div><h2 class="title">${escapeHtml(q.title)}</h2>
        ${q.choices.map(c=>`<label class="choice"><input type="radio" name="${name}" value="${escapeHtml(c)}" ${value===c?'checked':''}><span>${escapeHtml(c)}</span></label>`).join("")}
      </div>`;
    }
    if(q.type === "scale"){
      const labels = q.labels || DEFAULT_SCALE_LABELS[state.lang];
      return `<div class="card"><div class="theme">Q${idx+1}</div><h2 class="title">${escapeHtml(q.title)}</h2>
        <div class="scale">
          <div class="scale-options">${SCALE_VALUES.map(n=>`<label><input type="radio" name="${name}" value="${n}" ${String(value)===String(n)?'checked':''}><span>${n}</span><small>${escapeHtml(labels[n-1] || "")}</small></label>`).join("")}</div>
        </div>
      </div>`;
    }
    if(q.type === "multi"){
      const arr = Array.isArray(value) ? value : [];
      return `<div class="card"><div class="theme">Q${idx+1}</div><h2 class="title">${escapeHtml(q.title)}</h2>
        ${q.choices.map(c=>`<label class="choice"><input type="checkbox" name="${name}" value="${escapeHtml(c)}" ${arr.includes(c)?'checked':''}><span>${escapeHtml(c)}</span></label>`).join("")}
        <input class="input" data-other="${name}" placeholder="${escapeHtml(t('otherText'))}" value="${escapeHtml(answers[q.id+'_other']||'')}" />
      </div>`;
    }
    return `<div class="card"><div class="theme">Q${idx+1}</div><h2 class="title">${escapeHtml(q.title)}</h2>
      <textarea class="textarea" name="${name}" placeholder="${q.optional ? (state.lang==='ja'?'任意':'Optional') : ''}">${escapeHtml(value)}</textarea>
    </div>`;
  }).join("");
}
function collectSurvey(formElement, items, answers, prefix=""){
  const form = new FormData(formElement);
  for(const q of items){
    const name = `${prefix}${q.id}`;
    if(q.type === "multi"){
      const vals = form.getAll(name);
      answers[q.id] = vals;
      const other = document.querySelector(`[data-other="${name}"]`)?.value.trim() || "";
      answers[q.id+"_other"] = other;
      if(vals.length === 0 && !q.optional){ state.error = t("required"); return false; }
    }else{
      const val = form.get(name) || "";
      answers[q.id] = val;
      if(!val && !q.optional){ state.error = t("required"); return false; }
    }
  }
  return true;
}
function renderPreSurvey(){
  const survey = DATA.survey[state.lang];
  const fields = renderSurveyFields(survey, state.preSurveyAnswers, "pre_");
  const idHelp = state.lang === "ja"
    ? "本名は入力せず，好きな英字4文字＋数字2桁で入力してください。例：BIKE33，NEKO12，STAR07"
    : "Do not enter your real name. Use four letters and two digits, such as BIKE33, NEKO12, or STAR07.";
  const emailHelp = state.lang === "ja"
    ? "1週間後の追加アンケートに協力できる場合のみ入力してください。入力は任意です。"
    : "Enter your email only if you can cooperate with the follow-up survey one week later. This is optional.";
  const consentText = state.lang === "ja"
    ? "回答内容，正誤，回答時間を研究目的で記録することに同意します。"
    : "I agree that my answers, correctness, and response time may be recorded for research purposes.";
  app.innerHTML = layout(`
    <section class="card">
      <div class="theme">${escapeHtml(t('surveyTitle'))}</div>
      <h2 class="title">${escapeHtml(t('participantId'))}</h2>
      <input id="participant" class="input" placeholder="BIKE33" value="${escapeHtml(state.participantId)}" />
      <p class="notice">${escapeHtml(idHelp)}</p>
      <h2 class="title" style="margin-top:18px">${state.lang === "ja" ? "メールアドレス（任意）" : "Email address (optional)"}</h2>
      <input id="email" class="input" type="email" placeholder="example@example.com" value="${escapeHtml(state.email)}" />
      <p class="notice">${escapeHtml(emailHelp)}</p>
      <label class="choice"><input id="consent" type="checkbox" ${state.consent ? 'checked' : ''}><span>${escapeHtml(consentText)}</span></label>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
    </section>
    <form id="preSurveyForm">${fields}
      <div class="row card"><button type="submit" class="btn">${escapeHtml(t('start'))}</button></div>
    </form>
  `);
  $("#preSurveyForm").addEventListener("submit", submitPreSurvey);
}
function submitPreSurvey(e){
  e.preventDefault();
  state.participantId = $("#participant").value.trim();
  state.email = $("#email").value.trim();
  state.consent = $("#consent").checked;
  if(!state.participantId){ state.error = t("required"); return renderPreSurvey(); }
  if(!/^[A-Za-z]{4}\d{2}$/.test(state.participantId)){
    state.error = state.lang === "ja" ? "参加者IDは英字4文字＋数字2桁で入力してください。例：BIKE33" : "Participant ID must be four letters and two digits, such as BIKE33.";
    return renderPreSurvey();
  }
  if(!state.consent){ state.error = state.lang === "ja" ? "同意欄にチェックしてください。" : "Please check the consent box."; return renderPreSurvey(); }
  if(!collectSurvey(e.target, DATA.survey[state.lang], state.preSurveyAnswers, "pre_")) return renderPreSurvey();
  state.introIndex = 0;
  setScreen("intro");
}

function renderIntro(){
  const card = DATA.introCards[state.introIndex];
  app.innerHTML = layout(`
    <section class="card stack">
      <div class="theme">${escapeHtml(textOf(card.theme))}</div>
      <h2 class="title">${escapeHtml(textOf(card.title))}</h2>
      <p>${escapeHtml(textOf(card.body)).replace(/\n/g,"<br>")}</p>
      <p class="notice">${escapeHtml(textOf(card.hint))}</p>
      <div class="row"><button class="btn" onclick="nextIntro()">${escapeHtml(t('next'))}</button></div>
    </section>
  `, `${state.introIndex+1} / ${DATA.introCards.length}`);
}
function nextIntro(){
  if(state.introIndex < DATA.introCards.length-1){ state.introIndex++; renderIntro(); }
  else { state.qIndex = 0; state.questionStartedAt = new Date().toISOString(); setScreen("question"); }
}

function renderQuestion(){
  const q = DATA.questions[state.qIndex];
  const progress = `${state.qIndex+1} / ${DATA.questions.length}`;
  let inputHtml = "";
  if(q.type === "single"){
    inputHtml = Object.keys(q.choices).map(k=>`<label class="choice"><input type="radio" name="answer" value="${k}"><span><strong>${k}. </strong>${escapeHtml(textOf(q.choices[k]))}</span></label>`).join("");
  } else if(q.type === "multi"){
    inputHtml = Object.keys(q.choices).map(k=>`<label class="choice"><input type="checkbox" name="answer" value="${k}"><span><strong>${k}. </strong>${escapeHtml(textOf(q.choices[k]))}</span></label>`).join("");
  } else if(q.type === "classify"){
    inputHtml = Object.keys(q.choices).map(k=>`
      <div class="choice" style="display:block">
        <p><strong>${k}. </strong>${escapeHtml(textOf(q.choices[k]))}</p>
        <div class="row">${q.groups.map(g=>`<label><input type="radio" name="class_${k}" value="${escapeHtml(g)}"> ${escapeHtml(groupLabel(q, g))}</label>`).join("")}</div>
      </div>`).join("");
  }
  app.innerHTML = layout(`
    ${q.image ? `<img class="question-img" src="./assets/${escapeHtml(q.image)}" alt="${escapeHtml(textOf(q.image_alt) || textOf(q.title))}">` : ""}
    <section class="card">
      <div class="theme">${escapeHtml(textOf(q.theme))}</div>
      <h2 class="title">${escapeHtml(textOf(q.title))}</h2>
      ${q.prelude ? `<p class="prelude">${escapeHtml(textOf(q.prelude))}</p>` : ""}
      <p>${escapeHtml(textOf(q.body))}</p>
      ${q.hint ? `<p class="notice compact"><strong>${state.lang === "ja" ? "判断の視点" : "Judgment point"}：</strong>${escapeHtml(textOf(q.hint))}</p>` : ""}
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      <form id="qForm">${inputHtml}<div class="row"><button class="btn" type="submit">${escapeHtml(t('submit'))}</button></div></form>
    </section>
  `, progress);
  $("#qForm").addEventListener("submit", submitQuestion);
}
function submitQuestion(e){
  e.preventDefault();
  const q = DATA.questions[state.qIndex];
  const form = new FormData(e.target);
  let selected, isCorrect = false;
  if(q.type === "single"){
    selected = form.get("answer");
    if(!selected){ state.error=t("required"); return renderQuestion(); }
    isCorrect = selected === q.correct;
  } else if(q.type === "multi"){
    selected = form.getAll("answer").sort();
    if(selected.length===0){ state.error=t("required"); return renderQuestion(); }
    isCorrect = JSON.stringify(selected) === JSON.stringify([...q.correct].sort());
  } else if(q.type === "classify"){
    selected = {};
    for(const k of Object.keys(q.choices)){
      const v = form.get(`class_${k}`);
      if(!v){ state.error=t("required"); return renderQuestion(); }
      selected[k] = v;
    }
    isCorrect = Object.keys(q.correct_groups).every(k => selected[k] === q.correct_groups[k]);
  }
  const answeredAt = new Date().toISOString();
  const responseTime = new Date(answeredAt) - new Date(state.questionStartedAt);
  if(isCorrect) state.score++;
  state.selected = selected;
  state.answers.push({
    session_id: state.sessionId,
    participant_id: state.participantId,
    language: state.lang,
    question_id: q.id,
    selected_answer: selectedValue(selected, q),
    correct_answer: correctValue(q),
    is_correct: isCorrect,
    question_started_at: state.questionStartedAt,
    answered_at: answeredAt,
    response_time_ms: responseTime
  });
  setScreen("feedback");
}
function renderFeedback(){
  const q = DATA.questions[state.qIndex];
  const selected = state.selected;
  const row = state.answers[state.answers.length-1];
  let details = "";
  if(q.type === "classify"){
    details = Object.keys(q.choices).map(k=>{
      const ok = selected[k] === q.correct_groups[k];
      return `<div class="detail-item"><span class="${ok?'good':'bad'}">${ok?'✓':'✗'}</span> <strong>${k}</strong> ${escapeHtml(textOf(q.choices[k]))}<br>
      <span class="muted">${escapeHtml(t('yourAnswer'))}: ${escapeHtml(groupLabel(q, selected[k]))} / ${escapeHtml(t('correctAnswer'))}: ${escapeHtml(groupLabel(q, q.correct_groups[k]))}</span><br>
      ${escapeHtml(textOf(q.per_choice_feedback[k]))}</div>`;
    }).join("");
  } else {
    const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);
    const correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
    details = Object.keys(q.choices).map(k=>{
      const picked = selectedSet.has(k), should = correctSet.has(k);
      let mark='・', cls='', status='';
      if(picked && should){mark='✓';cls='good';status= state.lang==='ja'?'選択して正解':'Selected correctly';}
      else if(picked && !should){mark='✗';cls='bad';status= state.lang==='ja'?'選択したが不正解':'Selected but incorrect';}
      else if(!picked && should){mark='△';cls='warn';status= state.lang==='ja'?'選ばなかったが本来は必要':'Should have selected';}
      else {status= state.lang==='ja'?'選ばなくてよい':'Not needed';}
      return `<div class="detail-item"><span class="${cls}">${mark} ${escapeHtml(status)}</span><br><strong>${k}</strong> ${escapeHtml(textOf(q.choices[k]))}<br>${escapeHtml(textOf(q.feedback[k]))}</div>`;
    }).join("");
  }
  const ok = row.is_correct;
  const nextLabel = state.qIndex >= DATA.questions.length-1 ? t("seeResult") : t("next");
  app.innerHTML = layout(`
    <section class="card">
      <div class="${ok?'feedback-ok':'feedback-ng'}">${escapeHtml(ok ? t('correct') : t('review'))}</div>
      <p class="notice">${escapeHtml(textOf(ok ? q.result_ok : q.result_ng))}</p>
      <div class="detail"><h3>${state.lang==='ja'?'各選択肢の整理':'Review of choices'}</h3>${details}</div>
      ${q.legal_note ? `<p class="source-note">${escapeHtml(textOf(q.legal_note))}</p>` : ""}
      <div class="row"><button class="btn" onclick="nextQuestion()">${escapeHtml(nextLabel)}</button></div>
    </section>
  `, `${state.score} / ${DATA.questions.length}`);
}
function nextQuestion(){
  if(state.qIndex >= DATA.questions.length-1){
    state.completedAt = new Date().toISOString();
    setScreen("result");
  }else{
    state.qIndex++;
    state.questionStartedAt = new Date().toISOString();
    setScreen("question");
  }
}

function diagnosis(){
  const s = state.score;
  if(state.lang === "ja"){
    if(s>=10) return ["ルール判断マスター型","多くの場面で，交通ルールと安全判断を安定して結びつけられています。"];
    if(s>=7) return ["基本理解型","基本的なルールは理解できていますが，一部の場面判断で迷いが残る可能性があります。"];
    if(s>=4) return ["感覚判断型","危なそうという感覚はありますが，制度上どう扱われるかの整理が必要です。"];
    return ["これから学習型","青切符制度や具体的な場面判断を，これから整理していく段階です。"];
  }
  if(s>=10) return ["Rule Judgment Master","You can connect traffic rules and safe decisions consistently in many situations."];
  if(s>=7) return ["Basic Understanding Type","You understand the basics, but some situation-based decisions may still be confusing."];
  if(s>=4) return ["Intuitive Judgment Type","You may sense danger, but need to organize how each action is handled under the system."];
  return ["Learning Starter","You are at the stage of organizing the blue ticket system and concrete situation-based judgments."];
}

function categorySummary(){
  const summary = {};
  for(const key of Object.keys(CATEGORY_META)){
    summary[key] = {correct:0,total:0,percent:0};
  }
  for(const q of DATA.questions){
    const category = q.category || QUESTION_CATEGORY[q.id] || "system_process";
    if(!summary[category]) summary[category] = {correct:0,total:0,percent:0};
    summary[category].total++;
  }
  for(const answer of state.answers){
    const q = DATA.questions.find(item => item.id === answer.question_id);
    const category = q?.category || QUESTION_CATEGORY[answer.question_id] || "system_process";
    if(answer.is_correct && summary[category]) summary[category].correct++;
  }
  for(const item of Object.values(summary)){
    item.percent = item.total ? Math.round(item.correct / item.total * 100) : 0;
  }
  return summary;
}

function strongestAndWeakest(summary){
  const entries = Object.entries(summary).filter(([,v]) => v.total > 0);
  entries.sort((a,b) => b[1].percent - a[1].percent);
  return {strongest: entries[0], weakest: entries[entries.length-1]};
}

function renderCategoryBars(summary){
  return `<div class="metric-grid">${Object.entries(summary).map(([key,value])=>{
    const meta = CATEGORY_META[key]?.[state.lang] || [key, ""];
    return `<div class="metric">
      <div class="metric-head"><strong>${escapeHtml(meta[0])}</strong><span>${value.correct}/${value.total}</span></div>
      <div class="progress"><div style="width:${value.percent}%"></div></div>
      <p class="muted">${escapeHtml(meta[1])}</p>
    </div>`;
  }).join("")}</div>`;
}

function renderComparison(summary){
  const stats = CONFIG.GROUP_STATS;
  if(!stats){
    return `<div class="comparison pending">
      <strong>${state.lang === "ja" ? "全体比較は準備中" : "Group comparison is not connected yet"}</strong>
      <p>${state.lang === "ja" ? "Google Sheetsの集計値を config.js の GROUP_STATS に入れると，平均点やカテゴリ別平均と比較できます。" : "Add aggregate values from Google Sheets to GROUP_STATS in config.js to compare with the group average."}</p>
    </div>`;
  }
  const avg = Number(stats.averageScore || 0);
  const scoreDiff = Math.round((state.score - avg) * 10) / 10;
  const label = scoreDiff >= 0
    ? (state.lang === "ja" ? `平均より ${scoreDiff} 問高い` : `${scoreDiff} above average`)
    : (state.lang === "ja" ? `平均より ${Math.abs(scoreDiff)} 問低い` : `${Math.abs(scoreDiff)} below average`);
  const rows = Object.entries(summary).map(([key,value])=>{
    const meta = CATEGORY_META[key]?.[state.lang] || [key, ""];
    const group = Number(stats.categoryAverages?.[key] || 0);
    return `<div class="compare-row">
      <span>${escapeHtml(meta[0])}</span>
      <div class="compare-bars">
        <i style="width:${value.percent}%"></i>
        <b style="width:${group}%"></b>
      </div>
      <small>${value.percent}% / ${group}%</small>
    </div>`;
  }).join("");
  return `<div class="comparison">
    <strong>${state.lang === "ja" ? "全体との比較" : "Group comparison"}</strong>
    <p>${state.lang === "ja" ? `あなたの正答数は ${state.score} 問，集計平均は ${avg} 問です。${label}。` : `Your score is ${state.score}; the group average is ${avg}. ${label}.`}</p>
    <div class="legend"><span><i class="self"></i>${state.lang === "ja" ? "あなた" : "You"}</span><span><i class="group"></i>${state.lang === "ja" ? "全体平均" : "Group avg."}</span></div>
    ${rows}
    <p class="muted">${state.lang === "ja" ? `比較対象：${stats.participantCount || "?"}名` : `Compared with ${stats.participantCount || "?"} participants`}</p>
  </div>`;
}

function followUpLink(){
  if(!CONFIG.FOLLOW_UP_URL) return "";
  const template = String(CONFIG.FOLLOW_UP_URL)
    .replaceAll("{participantId}", encodeURIComponent(state.participantId))
    .replaceAll("{sessionId}", encodeURIComponent(state.sessionId))
    .replaceAll("{lang}", encodeURIComponent(state.lang));
  const url = new URL(template, location.href);
  if(String(CONFIG.FOLLOW_UP_URL).includes("{participantId}") || String(CONFIG.FOLLOW_UP_URL).includes("{sessionId}")){
    return url.toString();
  }
  url.searchParams.set("pid", state.participantId);
  url.searchParams.set("sid", state.sessionId);
  url.searchParams.set("lang", state.lang);
  return url.toString();
}

function resultProfile(){
  const summary = categorySummary();
  const {strongest, weakest} = strongestAndWeakest(summary);
  return {
    diagnosis: diagnosis()[0],
    score: state.score,
    total: DATA.questions.length,
    percent: Math.round(state.score / DATA.questions.length * 100),
    categories: summary,
    strongest_category: strongest?.[0] || "",
    weakest_category: weakest?.[0] || ""
  };
}

function renderResult(){
  const [type, comment] = diagnosis();
  const pct = Math.round(state.score / DATA.questions.length * 100);
  const btnText = state.lang === "ja" ? "事後アンケートへ進む" : "Continue to post-survey";
  const summary = categorySummary();
  app.innerHTML = layout(`
    <section class="card stack">
      <div class="theme">${escapeHtml(t('resultTitle'))}</div>
      <h2 class="title">${escapeHtml(t('score'))}: ${state.score} / ${DATA.questions.length}</h2>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="result-type">${escapeHtml(type)}</p>
      <p>${escapeHtml(comment)}</p>
      ${renderCategoryBars(summary)}
      ${renderComparison(summary)}
      <p class="notice">${state.lang === "ja" ? "最後に，学習後の意識変化を確認するための簡単な事後アンケートに回答してください。" : "Finally, please answer a short post-survey to check changes after learning."}</p>
      <div class="row"><button class="btn" onclick="setScreen('post')">${escapeHtml(btnText)}</button><button class="btn secondary" onclick="downloadCsv()">${escapeHtml(t('download'))}</button></div>
    </section>
  `, `${state.score} / ${DATA.questions.length}`);
}

function renderPostSurvey(){
  const survey = DATA.postSurvey[state.lang];
  const fields = renderSurveyFields(survey, state.postSurveyAnswers, "post_");
  app.innerHTML = layout(`
    <section class="card">
      <div class="theme">${state.lang === "ja" ? "事後アンケート" : "Post-survey"}</div>
      <h2 class="title">${state.lang === "ja" ? "学習後の変化について" : "About changes after learning"}</h2>
      <p class="notice">${state.lang === "ja" ? "事前アンケートと対応する項目を含めています。5段階の中立をなくし，4段階で回答します。" : "Some items correspond to the pre-survey. The neutral midpoint has been removed, so answers use a four-point scale."}</p>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
    </section>
    <form id="postSurveyForm">${fields}
      <div class="row card"><button type="submit" class="btn">${state.lang === "ja" ? "送信して終了" : "Submit and finish"}</button></div>
    </form>
  `, `${state.score} / ${DATA.questions.length}`);
  $("#postSurveyForm").addEventListener("submit", submitPostSurvey);
}
async function submitPostSurvey(e){
  e.preventDefault();
  if(!collectSurvey(e.target, DATA.postSurvey[state.lang], state.postSurveyAnswers, "post_")) return renderPostSurvey();
  state.postSurveyCompletedAt = new Date().toISOString();
  state.submissionStatus = "sending";
  state.submissionMessage = state.lang === "ja" ? "回答ログを送信しています。" : "Sending response log.";
  setScreen("final");
  await submitResearchLog();
}
function renderFinal(){
  const follow = state.email
    ? (state.lang === "ja" ? "入力されたメールアドレスには，1週間後アンケートのURLと参加者IDを送付できる設定です。" : "The follow-up survey URL and participant ID can be sent to the email address you entered.")
    : (state.lang === "ja" ? "メールアドレスは未入力のため，1週間後アンケートの送付対象にはなりません。" : "No email address was entered, so no follow-up survey will be sent.");
  const statusClass = state.submissionStatus === "sent" ? "good" : state.submissionStatus === "failed" ? "bad" : "muted";
  const statusText = state.submissionMessage || (state.lang === "ja" ? "送信状態を確認中です。" : "Checking submission status.");
  const link = followUpLink();
  app.innerHTML = layout(`
    <section class="card stack center">
      <div class="theme">${state.lang === "ja" ? "終了" : "Finished"}</div>
      <h2 class="title">${state.lang === "ja" ? "ご協力ありがとうございました" : "Thank you for your cooperation"}</h2>
      <p>${escapeHtml(follow)}</p>
      ${link ? `<p class="notice">${state.lang === "ja" ? "1週間後アンケートURL：" : "Follow-up survey URL:"}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : ""}
      <p class="save-status ${statusClass}">${escapeHtml(statusText)}</p>
      <p class="notice">${state.lang === "ja" ? "自動送信が未設定または失敗した場合に備えて，下のボタンからCSVログも保存できます。" : "You can also save the CSV log below in case automatic submission is not configured or fails."}</p>
      <div class="row"><button class="btn" onclick="downloadCsv()">${escapeHtml(t('download'))}</button><button class="btn secondary" onclick="location.reload()">${escapeHtml(t('restart'))}</button></div>
    </section>
  `);
}

function buildSubmissionPayload(eventType="main_submission"){
  const profile = resultProfile();
  return {
    event_type: eventType,
    submitted_at: new Date().toISOString(),
    session: {
      session_id: state.sessionId,
      participant_id: state.participantId,
      email: state.email,
      language: state.lang,
      consent: state.consent,
      started_at: state.sessionStartedAt,
      simulation_completed_at: state.completedAt,
      post_survey_completed_at: state.postSurveyCompletedAt
    },
    pre_survey: state.preSurveyAnswers,
    post_survey: state.postSurveyAnswers,
    answers: state.answers,
    result: profile,
    follow_up: {
      requested: Boolean(state.email),
      url: followUpLink()
    },
    user_agent: navigator.userAgent
  };
}

async function submitResearchLog(){
  if(!CONFIG.GOOGLE_SCRIPT_URL){
    state.submissionStatus = "skipped";
    state.submissionMessage = state.lang === "ja"
      ? "Google Sheets連携URLが未設定です。CSVログを保存してください。"
      : "Google Sheets integration URL is not configured. Please save the CSV log.";
    return renderFinal();
  }
  try{
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify(buildSubmissionPayload())
    });
    state.submissionStatus = "sent";
    state.submissionMessage = state.lang === "ja"
      ? "回答ログを送信しました。Google Sheets側に反映されます。"
      : "Response log was sent and should appear in Google Sheets.";
  }catch(err){
    state.submissionStatus = "failed";
    state.submissionMessage = state.lang === "ja"
      ? "自動送信に失敗しました。CSVログを保存してください。"
      : "Automatic submission failed. Please save the CSV log.";
  }
  renderFinal();
}

function downloadCsv(){
  const rows = [];
  rows.push(["section","key","value"]);
  rows.push(["session","session_id",state.sessionId]);
  rows.push(["session","participant_id",state.participantId]);
  rows.push(["session","email",state.email]);
  rows.push(["session","language",state.lang]);
  rows.push(["session","started_at",state.sessionStartedAt]);
  rows.push(["session","simulation_completed_at",state.completedAt]);
  rows.push(["session","post_survey_completed_at",state.postSurveyCompletedAt]);
  rows.push(["session","total_score",state.score]);
  rows.push(["session","submission_status",state.submissionStatus]);
  rows.push(["session","follow_up_url",followUpLink()]);
  const profile = resultProfile();
  rows.push(["result","diagnosis",profile.diagnosis]);
  rows.push(["result","score_percent",profile.percent]);
  for(const [k,v] of Object.entries(profile.categories)) rows.push(["result_category",k,`${v.correct}/${v.total} (${v.percent}%)`]);
  for(const [k,v] of Object.entries(state.preSurveyAnswers)) rows.push(["pre_survey",k,Array.isArray(v)?v.join("|"):v]);
  for(const [k,v] of Object.entries(state.postSurveyAnswers)) rows.push(["post_survey",k,Array.isArray(v)?v.join("|"):v]);
  rows.push([]);
  rows.push(["question_id","selected_answer","correct_answer","is_correct","question_started_at","answered_at","response_time_ms"]);
  state.answers.forEach(a=>rows.push([a.question_id,a.selected_answer,a.correct_answer,a.is_correct,a.question_started_at,a.answered_at,a.response_time_ms]));
  const csv = "\ufeff" + rows.map(r=>r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.participantId || "participant"}_${new Date().toISOString().replace(/[:.]/g,"-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

render();
