(() => {
  'use strict';
  const p = () => window.Portal;
  const state = () => p().state;
  const courses = () => window.COURSES || [];
  const v = () => document.querySelector('#view');
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const path = (c,l) => c.id + '/' + l.id;
  const getCourse = id => courses().find(c => c.id === id) || courses()[0];
  const completed = (c,l) => (state().completed || []).includes(path(c,l));
  const events = (c,l) => (state().events || []).filter(a => a.type === 'answer' && a.courseId === c.id && a.lessonId === l.id);
  const latest = (c,l,id) => events(c,l).filter(a => a.questionId === id).at(-1);
  const link = (route, body, cls='') => '<a href="#/'+route+'" class="'+cls+'">'+body+'</a>';
  const glyphs = {
    arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', down:'<path d="m7 10 5 5 5-5"/>', check:'<path d="m5 12 4 4 10-10"/>', clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>', book:'<path d="M3 5c4-1 6 0 9 2 3-2 5-3 9-2v14c-3-1-6 0-9 2-3-2-6-3-9-2zM12 7v14"/>', layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>', cards:'<rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>', print:'<path d="M6 8V3h12v5M6 17H3v-7h18v7h-3"/><path d="M6 14h12v7H6z"/>', spark:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>', expand:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>', close:'<path d="m6 6 12 12m0-12L6 18"/>', back:'<path d="m14 6-6 6 6 6"/>', repeat:'<path d="M4 10a8 8 0 1 1 1 7M4 5v5h5"/>', eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2"/>'
  };
  const ico=(id,size=17)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(glyphs[id]||'')+'</svg>';
  const button = (act, label, cls='') => '<button type="button" class="lr-btn '+cls+'" data-la="'+act+'">'+label+'</button>';
  const tab = (c,route,sel) => link(route+'/'+c.id,e(c.title),'lr-tab'+(sel?' selected':''));
  const meta = (icon,text) => '<span class="lr-meta">'+ico(icon,15)+e(text)+'</span>';
  const pct = c => c.lessons.length ? Math.round(100*c.lessons.filter(l=>completed(c,l)).length/c.lessons.length) : 0;
  const countLabel = (n, forms) => {const last=n%10;return n+' '+forms[n%100>=11&&n%100<=14?2:last===1?0:last>=2&&last<=4?1:2];};
  const lessonsLabel=n=>countLabel(n,['шаг','шага','шагов']);
  const tasksLabel=n=>countLabel(n,['задание','задания','заданий']);
  let readerTab='read', assistant=false, hintCount=0, assistantReply='', timer=null, activeQuiz=null;
  let cardCourse='',cardFilter='all',cardIndex=0,flipped=false;
  function stopClock() {
    if(timer?.start!=null) {
      timer.accum += performance.now()-timer.start;
      timer.start=null;
    }
  }
  function resumeClock() {
    if(timer && !document.hidden && v()?.querySelector('[data-lr-question]') && timer.start===null) timer.start=performance.now();
  }
  function elapsed() {
    return timer ? Math.round((timer.accum+(timer.start===null?0:performance.now()-timer.start))/100)/10 : 0;
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopClock();else resumeClock();});
  window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/lesson/')){stopClock();timer=null;}});
  const qstate=(c,l,id)=>events(c,l).filter(a=>a.questionId===id);
  function notes(c) {
    const printout=document.createElement('div'); printout.id='lr-printout';
    printout.innerHTML='<h1>'+e(c.title)+'</h1><p>'+e(c.book)+' · '+e(c.author)+'</p>'+c.lessons.map(l=>'<section><h2>'+e(l.title)+'</h2><p>'+e(l.intro)+'</p>'+l.body.map(x=>'<p>'+e(x)+'</p>').join('')+'<blockquote>'+e(l.quote)+'</blockquote><small>Страница PDF '+e(l.page)+'</small></section>').join('');
    document.querySelector('#lr-printout')?.remove();document.body.append(printout);
    window.print();
  }
  window.addEventListener('afterprint',()=>document.querySelector('#lr-printout')?.remove());
  function findResume(c){const id=state().last?.split('/');return (id?.[0]===c.id&&c.lessons.find(l=>l.id===id[1]&&!completed(c,l)))||c.lessons.find(l=>!completed(c,l))||c.lessons[0];}
  function map(c) {
    const count=c.lessons.filter(l=>completed(c,l)).length, next=findResume(c);
    const units=c.lessons.reduce((t,l)=>t+l.questions.length,0);
    v().innerHTML='<div class="lr-wrap"><header class="lr-header"><div><span class="lr-overline">ОБРАЗОВАТЕЛЬНЫЙ ТРЕК</span><h1>Карта обучения</h1></div>'+button('notes',ico('print')+' Конспект','quiet')+'</header><nav class="lr-tabs" aria-label="Главы">'+courses().map(x=>tab(x,'map',x.id===c.id)).join('')+'</nav><div class="lr-map-grid"><section><div class="lr-section-head"><div class="lr-overline">МАРШРУТ ГЛАВЫ</div><h2>'+e(c.title)+'</h2><p>'+e(c.subtitle)+'</p><div class="lr-row">'+meta('layers',lessonsLabel(c.lessons.length))+meta('cards',tasksLabel(units))+meta('clock',c.lessons.reduce((n,l)=>n+Number(l.minutes||0),0)+' мин')+'</div></div><ol class="lr-track">'+c.lessons.map((l,i)=>{const done=completed(c,l),active=next===l&&!done;return '<li class="'+(done?'done':active?'now':'')+'"><span class="lr-dot">'+(done?ico('check',16):String(i+1).padStart(2,'0'))+'</span>'+link('lesson/'+path(c,l),'<div><small>'+ (done?'ПРОЙДЕНО':active?'ТЕКУЩИЙ ШАГ':'ШАГ '+String(i+1).padStart(2,'0'))+'</small><h3>'+e(l.title)+'</h3><span>'+e(l.minutes)+' мин · '+tasksLabel(l.questions.length)+'</span></div>'+ico('arrow',19),'lr-stop')+'</li>';}).join('')+'</ol></section><aside class="lr-aside"><section class="lr-box lr-progress-card"><span class="lr-overline">ПРОГРЕСС ГЛАВЫ</span><div class="lr-big-num">'+pct(c)+'<small>%</small></div><div class="lr-meter"><i style="width:'+pct(c)+'%"></i></div><p>Пройдено шагов: '+count+' из '+c.lessons.length+'</p>'+link('lesson/'+path(c,next),(count?'Продолжить маршрут':'Открыть шаг')+ico('arrow'),'lr-btn main')+'</section><section class="lr-box"><span class="lr-aside-icon">'+ico('book',22)+'</span><h3>Источник главы</h3><p>'+e(c.book)+'</p><small>'+e(c.author)+' · стр. '+e(c.pages)+'</small></section>'+link('cards/'+c.id,ico('cards',20)+' Карточки главы '+ico('arrow'),'lr-btn quiet full')+'</aside></div></div>';
    v().querySelector('[data-la="notes"]').onclick=()=>notes(c);
  }
  function showSource(l) {
    const dialog=document.createElement('dialog'); dialog.className='lr-dialog';
    dialog.innerHTML='<div class="lr-dialog-title"><span>Страница PDF '+e(l.page)+'</span>'+button('close',ico('close')+' Закрыть','quiet')+'</div><img src="'+e(l.sourceImage)+'" alt="Скан страницы '+e(l.page)+'"><p>'+e(l.figureCaption||'Фрагмент первоисточника')+'</p>';
    document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close();});dialog.onclose=()=>dialog.remove();dialog.showModal();
  }
  function startQuiz(c,l,retry=false) {
    const unseen=l.questions.filter(q=>!latest(c,l,q.id));
    const missed=l.questions.filter(q=>latest(c,l,q.id)?.correct===false);
    const items=(retry||!unseen.length)&&missed.length?missed:unseen.length?unseen:l.questions;
    activeQuiz={items,index:0,feedback:null,selected:[],input:'',ordering:[],confidence:null};
    hintCount=0;assistant=false;assistantReply='';readerTab='quiz';initTimer();lesson(c,l);
  }
  function initTimer(){timer={start:document.hidden?null:performance.now(),accum:0};}
  function chooseTab(c,l,name) {
    if(name==='quiz'&&!activeQuiz){startQuiz(c,l);return;}
    if(readerTab==='quiz'&&name!=='quiz')stopClock();
    readerTab=name;lesson(c,l);if(name==='quiz')resumeClock();
  }
  function assistantPane(l,q) {
    if(!assistant)return button('assistant',ico('spark')+' Подсказка','quiet');
    return '<section class="lr-help"><div class="lr-help-title"><strong>'+ico('spark')+' Помощник шага</strong>'+button('assistant',ico('close'),'icon')+'</div><p class="lr-help-message" aria-live="polite">'+e(assistantReply||'С чего начнём? Можно запросить ориентир по заданию или найти объяснение в тексте шага.')+'</p><div class="lr-row">'+button('hint',hintCount?'Ещё подсказка':'Дать подсказку','small')+button('hint-source','Где прочитать?','small')+'</div><form class="lr-ask"><label class="lr-sr" for="lr-query">Вопрос по этому шагу</label><input id="lr-query" type="text" maxlength="300" placeholder="Спросить по шагу…" required><button aria-label="Задать вопрос">'+ico('arrow')+'</button></form><small>Подсказки по материалам главы · офлайн</small></section>';
  }
  function ansText(q) {
    if(q.type==='single')return q.options[q.answer];
    if(q.type==='multi'||q.type==='order')return q.answer.map(n=>q.options[n]).join(q.type==='order'?' → ':'; ');
    return q.answer;
  }
  function safeHint(l,q,level){
    const answer=q?String(ansText(q)).toLowerCase().trim():'';
    const arr=(l.hints||[]).filter(h=>!q||(!h.toLowerCase().includes(answer)&&!(q.type==='multi'&&q.answer.some(i=>h.toLowerCase().includes(String(q.options[i]).toLowerCase())))));
    const fallback=['Выделите в вопросе то, что наблюдают или измеряют непосредственно.','Сопоставьте условия задачи с примером на странице '+l.page+'.','Проверьте, какое ограничение из текста шага относится к этому случаю.'];
    return [...arr,...fallback][Math.min(level,arr.length+fallback.length-1)];
  }
  function mediaLink(c,l) {
    const media=window.MEDIA; if(!media)return '';
    if(c.id==='logs' && l.page===media.shorts?.[0]?.sourcePage) return link('shorts/'+media.shorts[0].id,ico('layers')+' Смотреть серию шортсов '+ico('arrow'),'lr-btn quiet full');
    if(c.id==='flow' && l.id==='flow-zones' && media.long)return link('video/'+media.long.id,ico('layers')+' Видеоразбор давления '+ico('arrow'),'lr-btn quiet full');
    return '';
  }
  function renderRead(c,l) {
    return '<article class="lr-box lr-prose"><div class="lr-overline">СУТЬ ШАГА</div><p class="lr-lead">'+e(l.intro)+'</p>'+(l.diagram?'<figure class="lr-diagram"><img src="'+e(l.diagram)+'" alt="'+e(l.diagramCaption)+'"><figcaption>'+e(l.diagramCaption)+' · стр. '+e(l.page)+'</figcaption></figure>':'')+'<h3>Как это работает</h3>'+l.body.map(x=>'<p>'+e(x)+' <button class="lr-page" data-la="source">стр. '+e(l.page)+'</button></p>').join('')+'<div class="lr-note"><strong>Частая ошибка</strong><p>'+e(l.misconception)+'</p></div>'+button('start',ico('layers')+' Перейти к заданиям','main')+'</article>';
  }
  function renderSource(c,l) {
    return '<section class="lr-box lr-prose"><div class="lr-overline">ПЕРВОИСТОЧНИК</div><h2>'+e(c.author)+'</h2><p>'+e(c.book)+'</p><blockquote>'+e(l.quote)+'</blockquote><small>Страница PDF '+e(l.page)+'</small><button type="button" class="lr-source-preview" data-la="source"><img src="'+e(l.sourceImage)+'" alt="Скан страницы '+e(l.page)+'"><span>'+ico('expand')+' Увеличить страницу</span></button><p>'+e(l.figureCaption||'')+'</p></section>';
  }
  function choices(q) {
    const a=activeQuiz;
    if(q.type==='single'||q.type==='multi')return '<div class="lr-choices" role="group" aria-label="Варианты ответа">'+q.options.map((x,i)=>'<button type="button" class="lr-choice" data-opt="'+i+'" aria-pressed="'+a.selected.includes(i)+'"><span>'+String.fromCharCode(65+i)+'</span>'+e(x)+'</button>').join('')+'</div>';
    if(q.type==='order')return '<div class="lr-choices">'+q.options.map((x,i)=>'<button type="button" class="lr-choice" data-opt="'+i+'" aria-pressed="'+a.ordering.includes(i)+'"><span>'+(a.ordering.includes(i)?a.ordering.indexOf(i)+1:'·')+'</span>'+e(x)+'</button>').join('')+'</div>';
    return '<label class="lr-input-label" for="lr-answer">Ваш ответ</label><input id="lr-answer" autocomplete="off" class="lr-answer" inputmode="'+(q.type==='number'?'decimal':'text')+'" placeholder="'+(q.type==='number'?'Введите число':'Введите слово или выражение')+'" value="'+e(a.input)+'">';
  }
  function quizPanel(c,l) {
    const a=activeQuiz;
    if(!a||a.index>=a.items.length) {
      const wrong=l.questions.filter(q=>latest(c,l,q.id)?.correct===false).length, right=l.questions.filter(q=>latest(c,l,q.id)?.correct).length;
      const next=c.lessons[c.lessons.indexOf(l)+1];
      return '<div class="lr-box lr-quiz lr-results"><span class="lr-aside-icon">'+ico('check',24)+'</span><div class="lr-overline">РЕЗУЛЬТАТ ШАГА</div><h2>'+right+' из '+l.questions.length+' верно</h2><p>Учтена последняя попытка по каждому заданию.'+(wrong?' Для повторения осталось '+tasksLabel(wrong)+'.':' Все задания шага пройдены.')+'</p><div class="lr-row">'+(wrong?button('retry',ico('repeat')+' Разобрать ошибки','main'):'')+(next?link('lesson/'+path(c,next),'Следующий шаг '+ico('arrow'),'lr-btn '+(wrong?'quiet':'main')):link('map/'+c.id,'К маршруту '+ico('arrow'),'lr-btn quiet'))+'</div></div>';
    }
    const q=a.items[a.index],f=a.feedback;
    const type={single:'Один вариант',multi:'Несколько вариантов',order:'Расставьте по порядку',blank:'Вставьте пропуск',number:'Числовой ответ'}[q.type]||'Ответ';
    return '<section class="lr-box lr-quiz" '+(!f?'data-lr-question':'')+'><div class="lr-quiz-head"><span class="lr-overline">ЗАДАНИЕ '+(a.index+1)+' / '+a.items.length+'</span><small>'+e(type)+'</small></div><div class="lr-meter"><i style="width:'+(100*(a.index+(f?1:0))/a.items.length)+'%"></i></div><h2>'+e(q.prompt)+'</h2>'+(f?'<div class="lr-feedback '+(f.correct?'good':'wrong')+'" role="status"><strong>'+e(f.correct?'Верно':'Разберём ответ')+'</strong><p>'+e(q.explanation)+'</p><small>Правильный ответ: '+e(ansText(q))+' · стр. '+e(l.page)+'</small></div>'+button('next',(a.index===a.items.length-1?'Посмотреть результат':'Дальше')+' '+ico('arrow'),'main'):choices(q)+'<div class="lr-quiz-foot">'+button('submit','Проверить ответ '+ico('arrow'),'main')+'<span class="lr-validation" role="status"></span></div>')+'</section>';
  }
  function lesson(c,l) {
    if(!l){map(c);return;}
    const i=c.lessons.indexOf(l);
    const q=readerTab==='quiz'&&activeQuiz&&!activeQuiz.feedback?activeQuiz.items[activeQuiz.index]:null;
    v().innerHTML='<div class="lr-wrap">'+link('map/'+c.id,ico('back',15)+' К маршруту','lr-back')+'<header class="lr-header lr-lesson-title"><div><span class="lr-overline">ШАГ '+String(i+1).padStart(2,'0')+' / '+String(c.lessons.length).padStart(2,'0')+'</span><h1>'+e(l.title)+'</h1><div class="lr-row">'+meta('clock',l.minutes+' мин')+meta('book',c.author+' · стр. '+l.page)+'</div></div></header><nav class="lr-tabs" aria-label="Разделы шага">'+[['read','Разбор'],['quiz','Задания · '+l.questions.length],['source','Источник']].map(([key,label])=>'<button class="lr-tab '+(readerTab===key?'selected':'')+'" data-pane="'+key+'">'+e(label)+'</button>').join('')+'</nav><div class="lr-lesson-grid"><div>'+(readerTab==='quiz'?quizPanel(c,l):readerTab==='source'?renderSource(c,l):renderRead(c,l))+'</div><aside class="lr-aside">'+assistantPane(l,q)+mediaLink(c,l)+'<section class="lr-box lr-mini-route"><span class="lr-overline">В ЭТОЙ ГЛАВЕ</span>'+c.lessons.map((other,j)=>link('lesson/'+path(c,other),'<span>'+(completed(c,other)?ico('check',14):String(j+1).padStart(2,'0'))+'</span>'+e(other.title),other===l?'current':'')).join('')+'</section></aside></div></div>';
    v().querySelectorAll('[data-pane]').forEach(n=>n.onclick=()=>chooseTab(c,l,n.dataset.pane));
    const ask=v().querySelector('.lr-ask');
    if(ask)ask.onsubmit=ev=>{ev.preventDefault();const text=ask.querySelector('input').value.trim();if(!text)return;
      const words=text.toLowerCase().match(/[а-яёa-z]{4,}/g)||[];
      const candidates=q?(l.hints||[]).filter(x=>!x.toLowerCase().includes(String(ansText(q)).toLowerCase())):l.body;
      const scored=candidates.map(x=>({x,s:words.filter(w=>x.toLowerCase().includes(w.slice(0,Math.min(5,w.length)))).length})).sort((a,b)=>b.s-a.s);
      assistantReply=scored[0]?.s?scored[0].x:'Уточните термин или откройте страницу '+l.page+'. '+safeHint(l,q,hintCount);hintCount++;lesson(c,l);};
    const handlers={
      notes:()=>notes(c),source:()=>showSource(l),assistant:()=>{assistant=!assistant;lesson(c,l);},
      hint:()=>{assistantReply=safeHint(l,q,hintCount++);lesson(c,l);},
      'hint-source':()=>{hintCount++;assistantReply='Откройте вкладку «Источник», стр. '+l.page+'. '+(l.figureCaption||'Сопоставьте термины вопроса с формулировкой автора.');lesson(c,l);},
      start:()=>chooseTab(c,l,'quiz'),retry:()=>startQuiz(c,l,true),submit:()=>submit(c,l,q),
      next:()=>{activeQuiz.index++;activeQuiz.feedback=null;activeQuiz.selected=[];activeQuiz.ordering=[];activeQuiz.input='';hintCount=0;assistantReply='';
        if(activeQuiz.index>=activeQuiz.items.length){timer=null;}
        else initTimer();lesson(c,l);}
    };
    v().querySelectorAll('[data-la]').forEach(el=>el.onclick=handlers[el.dataset.la]);
    v().querySelectorAll('[data-opt]').forEach(el=>el.onclick=()=>{const n=Number(el.dataset.opt), a=activeQuiz;
      const field=q.type==='order'?'ordering':'selected';const list=a[field];
      a[field]=q.type==='single'?[n]:list.includes(n)?list.filter(i=>i!==n):[...list,n];
      v().querySelectorAll('[data-opt]').forEach(x=>{const index=Number(x.dataset.opt);x.setAttribute('aria-pressed',String(a[field].includes(index)));if(q.type==='order')x.firstElementChild.textContent=a.ordering.includes(index)?a.ordering.indexOf(index)+1:'·';});});
    const input=v().querySelector('#lr-answer');
    if(input){input.oninput=()=>activeQuiz.input=input.value;input.onkeydown=ev=>{if(ev.key==='Enter')submit(c,l,q);};}
  }
  function submit(c,l,q) {
    if(!q||activeQuiz.feedback)return;
    const a=activeQuiz;
    const norm=x=>String(x??'').toLowerCase().replace(/ё/g,'е').replace(/[,]/g,'.').replace(/\s+/g,' ').trim();
    let response,correct;
    if(q.type==='single'){response=a.selected[0];correct=response===q.answer;}
    else if(q.type==='multi'||q.type==='order'){response=q.type==='order'?[...a.ordering]:[...a.selected].sort((x,y)=>x-y);const wanted=q.type==='order'?q.answer:[...q.answer].sort((x,y)=>x-y);correct=JSON.stringify(response)===JSON.stringify(wanted);}
    else {response=a.input.trim();const accepted=[q.answer,...(q.accepted||[])];correct=q.type==='number'?Number.isFinite(Number(norm(response)))&&Math.abs(Number(norm(response))-Number(norm(q.answer)))<1e-8:accepted.some(x=>norm(x)===norm(response));}
    if(response==null||response===''||Array.isArray(response)&&(!response.length||q.type==='order'&&response.length!==q.options.length)){v().querySelector('.lr-validation').textContent=q.type==='order'?'Укажите порядок всех элементов.':'Сначала введите или выберите ответ.';return;}
    stopClock();const attempt=qstate(c,l,q.id).length+1;
    p().record({type:'answer',courseId:c.id,lessonId:l.id,questionId:q.id,correct,elapsed:elapsed(),hints:hintCount,attempt,response});
    if(l.questions.every(x=>latest(c,l,x.id))&&!completed(c,l)){state().completed.push(path(c,l));p().save();}
    a.feedback={correct};lesson(c,l);
  }
  function cards(c) {
    const list=c.lessons.filter(l=>cardFilter==='all'||(state().cards[path(c,l)]||'new')===cardFilter);
    if(cardIndex>=list.length)cardIndex=0;
    const l=list[cardIndex], status=l?state().cards[path(c,l)]||'new':'';
    v().innerHTML='<div class="lr-wrap"><header class="lr-header"><div><span class="lr-overline">ПОВТОРЕНИЕ</span><h1>Карточки</h1></div>'+link('map/'+c.id,'К маршруту '+ico('arrow'),'lr-btn quiet')+'</header><nav class="lr-tabs" aria-label="Глава для повторения">'+courses().map(x=>tab(x,'cards',x.id===c.id)).join('')+'</nav><div class="lr-flash-layout"><div><div class="lr-filter">'+[['all','Все'],['new','Новые'],['review','Повторить'],['known','Знаю']].map(([key,label])=>'<button type="button" data-filter="'+key+'" aria-pressed="'+(cardFilter===key)+'">'+label+'</button>').join('')+'</div>'+(l?'<button type="button" class="lr-flash '+(flipped?'flipped':'')+'" data-la="flip"><span class="lr-flash-top"><span>'+ico('cards')+' '+(flipped?'ОТВЕТ':'ВОПРОС')+'</span><small>'+String(cardIndex+1).padStart(2,'0')+' / '+String(list.length).padStart(2,'0')+'</small></span><strong>' +e(flipped?(l.flashcard?.back||l.intro):(l.flashcard?.front||l.title))+'</strong><small>'+ico('repeat',14)+' Перевернуть карточку</small></button><div class="lr-flash-controls">'+button('review',ico('repeat')+' Повторить','quiet')+button('known',ico('check')+' Знаю','main')+'</div><div class="lr-flash-nav">'+button('prev',ico('back')+' Назад','small')+'<small>'+e(({known:'Знаю',review:'Повторить',new:'Новая карточка'})[status])+'</small>'+button('next','Вперёд '+ico('arrow'),'small')+'</div>':'<div class="lr-box"><h3>Карточек с такой отметкой пока нет</h3><p>Откройте все карточки главы, чтобы начать повторение.</p>'+button('all','Показать все','main')+'</div>')+'</div><aside class="lr-aside"><div class="lr-box"><span class="lr-aside-icon">'+ico('layers',22)+'</span><h3>'+e(c.title)+'</h3><p>Вспомните ответ до переворота карточки. Отметку можно изменить при следующем повторении.</p><small>Карточек в главе: '+c.lessons.length+'</small></div></aside></div></div>';
    v().querySelectorAll('[data-filter]').forEach(n=>n.onclick=()=>{cardFilter=n.dataset.filter;cardIndex=0;flipped=false;cards(c);});
    v().querySelectorAll('[data-la]').forEach(n=>n.onclick=()=>{const act=n.dataset.la;
      if(act==='all'){cardFilter='all';cardIndex=0;}else if(act==='flip')flipped=!flipped;
      else if(act==='next'||act==='prev'){flipped=false;cardIndex=(cardIndex+(act==='next'?1:-1)+list.length)%list.length;}
      else if(act==='review'||act==='known'){state().cards[path(c,l)]=act;p().save();if(cardFilter==='all'||cardFilter===act)cardIndex=(cardIndex+1)%list.length;flipped=false;}cards(c);});
  }
  window.renderLearning=parts=>{
    const c=getCourse(parts[1]||(state().last||'').split('/')[0]);if(!c){v().textContent='Материалы курса ещё не загружены.';return;}
    if(parts[0]==='lesson'){
      const l=c.lessons.find(x=>x.id===parts[2])||findResume(c);
      const key=path(c,l);stopClock();timer=null;activeQuiz=null;assistant=false;hintCount=0;assistantReply='';readerTab='read';
      state().last=key;p().save();lesson(c,l);
    }else{stopClock();timer=null;activeQuiz=null;
      if(parts[0]==='cards'){if(cardCourse!==c.id){cardCourse=c.id;cardFilter='all';cardIndex=0;flipped=false;}cards(c);}else map(c);}
  };
})();
