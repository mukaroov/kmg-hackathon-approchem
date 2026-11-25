(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const groups = window.COURSES;
  const clips = window.MEDIA.shorts;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shapes = {
    home:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    map:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h10a4 4 0 0 1 0 8H7a2 2 0 0 0 0 4h10"/>',
    shorts:'<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="m10 8 6 4-6 4z"/>',
    team:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 5 5"/>',
    cards:'<rect x="7" y="6" width="13" height="15" rx="2"/><path d="M16 3H5a2 2 0 0 0-2 2v12"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    moon:'<path d="M21 13a9 9 0 1 1-10-10 7.5 7.5 0 0 0 10 10Z"/>',
    arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', corner:'<path d="M6 18 18 6M7 6h11v11"/>',
    layers:'<path d="m2 8 10-5 10 5-10 5zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',check:'<path d="m4 12 5 5L20 6"/>',
    list:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 9 1 1 2-3m2 2h4M7 14h2m3 0h4"/>',
    play:'<path d="m8 5 11 7-11 7z"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
  };
  const icon = (k,size=18) => '<svg class="icon" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[k]||'')+'</svg>';
  const makeID=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);
  const defaults={id:makeID(),name:'Участник',completed:[],last:'',events:[],cards:{},video:{},deadline:'',theme:'dark'};
  let state={...defaults};
  try{Object.assign(state,JSON.parse(localStorage.getItem('strata-profile-v1')||'{}'));}catch{}
  let warned=false;
  function toast(message){const n=el('toast');n.textContent=message;n.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>n.style.display='none',2800);}
  function save(){try{localStorage.setItem('strata-profile-v1',JSON.stringify(state));}catch{if(!warned){warned=true;toast('Браузер ограничил сохранение на устройстве.');}}}
  function record(event){state.events.push({...event,ts:new Date().toISOString(),id:makeID()});save();}
  function go(route){location.hash='#/'+route.replace(/^#?\/?/,'');}
  window.Portal={state,save,record,go,esc,icon};
  const names={home:'Обзор',map:'Маршрут',shorts:'Шортсы',team:'Команда'};
  const allLessons=groups.flatMap(c=>c.lessons.map(l=>({...l,key:c.id+'/'+l.id})));
  function setHeader(route){
    const navKey=({lesson:'map',cards:'map',video:'shorts'})[route]||route;
    el('mainNav').innerHTML=Object.entries(names).map(([k,label])=>'<a href="#/'+k+'" '+(navKey===k?'class="active" aria-current="page"':'')+'>'+icon(k,16)+label+'</a>').join('');
    el('profile').textContent=(state.name||'У').trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
    document.documentElement.dataset.theme=state.theme;
    el('mode').innerHTML=icon(state.theme==='light'?'moon':'sun',17);
  }
  const lessonPath=()=>allLessons.find(l=>l.key===state.last)?.key||allLessons[0].key;
  function home(){
    const stats=[['layers',groups.length,'Учебных модуля'],['map',state.completed.length+' / '+allLessons.length,'Шагов пройдено'],['list',allLessons.reduce((s,l)=>s+l.questions.length,0),'Заданий для практики'],['shorts',clips.length,'Интерактивных шортса']];
    el('view').innerHTML='<section class="homehero"><div class="hero-visual" role="img" aria-label="Условная объёмная модель рельефа с горизонталями и слоями пород"></div><div class="hero-copy"><div class="eyebrow"><span class="beacon"></span>Программа обучения</div><h1>Геология<br>и геофизика</h1><p>Изучайте недра по каротажным диаграммам, моделям пласта и геологическим разрезам.</p><div class="home-actions"><a class="action solid" href="#/lesson/'+lessonPath()+'">'+(state.last?'Продолжить обучение':'Начать обучение')+' '+icon('arrow',17)+'</a><a class="action ghost" href="#/map">'+icon('map',16)+' Маршрут</a></div></div><span class="asset-label">Условная модель рельефа</span></section>'+
      '<div class="home-stats">'+stats.map(([i,v,l])=>'<div class="mini-stat"><span class="stat-icon">'+icon(i,19)+'</span><div><strong>'+v+'</strong><small>'+l+'</small></div></div>').join('')+'</div>'+
      '<section><div class="section-head"><h2>Учебные модули</h2><a class="text-link" href="#/cards">'+icon('cards',15)+' Карточки</a></div><div class="course-grid">'+groups.map((c,i)=>'<a class="course-tile" href="#/map/'+esc(c.id)+'"><div class="course-cover" style="background-image:url(assets/field-'+i+'.webp)"><span class="module-tag">Модуль 0'+(i+1)+'</span></div><div class="course-copy"><h3>'+esc(c.title)+'</h3><p>'+esc(c.author)+'</p><div class="course-meta">'+icon('map',14)+' '+c.lessons.length+' шага <span>·</span> '+icon('clock',14)+' '+c.lessons.reduce((s,l)=>s+l.minutes,0)+' мин <span class="round-arrow">'+icon('arrow',14)+'</span></div></div></a>').join('')+'</div></section>'+
      '<section class="more-home"><div class="section-head"><h2>Интерактивные шортсы</h2><a class="text-link" href="#/shorts">Все выпуски '+icon('arrow',15)+'</a></div><div class="short-grid">'+clips.map((s,i)=>'<a class="short-tile" href="#/shorts/'+esc(s.id)+'"><img src="'+esc(s.poster)+'" alt="" loading="lazy"><div><span class="micro">Часть '+(i+1)+' · '+s.duration+' с</span><b>'+esc(s.title)+'</b></div></a>').join('')+'</div></section>';
  }
  function sources(){el('view').innerHTML='<h1 class="page-title">Источники курса</h1><p>Фрагменты привязаны к нумерации страниц PDF. Сканы открываются в исходном разрешении.</p><div class="source-list">'+groups.map(c=>'<article><div class="micro">'+esc(c.author)+'</div><h3>'+esc(c.book)+'</h3><p>Страницы '+esc(c.pages)+'</p><details><summary>Страницы занятий</summary>'+c.lessons.map(l=>'<p><a class="text-link" href="'+esc(l.sourceImage)+'" target="_blank" rel="noopener"><img src="'+esc(l.sourceImage)+'" alt=""> Стр. '+esc(l.page)+' ↗</a></p>').join('')+'</details></article>').join('')+'</div><h2>Контрольная выборка</h2><div class="source-list">'+window.CONTROL_BOOKS.map(b=>'<article><div class="micro">'+esc(b.author)+'</div><h3>'+esc(b.title)+'</h3><p>'+esc(b.summary)+'</p>Страницы '+esc(b.pages)+'</article>').join('')+'</div>';}
  function route(){
    const parts=(location.hash.replace(/^#\/?/,'')||'home').split('/');
    const key=parts[0];
    setHeader(key);
    document.title=(names[key]||({sources:'Источники',cards:'Карточки',lesson:'Занятие',video:'Видеоразбор'})[key]||'Обзор')+' · STRATA';
    if(key==='team')window.renderTeam(parts);
    else if(['lesson','cards','map'].includes(key))window.renderLearning(parts);
    else if(['shorts','video'].includes(key))window.renderWatch(parts);
    else if(key==='sources')sources();else home();
    const view=el('view');view.classList.remove('arrive');void view.offsetWidth;view.classList.add('arrive');window.scrollTo({top:0,behavior:'instant'});
  }
  el('mode').onclick=()=>{state.theme=state.theme==='light'?'dark':'light';save();setHeader((location.hash.slice(2)||'home').split('/')[0]);};
  el('profile').onclick=()=>{el('userName').value=state.name;el('due').value=state.deadline;el('settings').showModal();};
  el('closeDlg').onclick=()=>el('settings').close();
  el('profileForm').onsubmit=e=>{e.preventDefault();state.name=el('userName').value.trim()||'Участник';state.deadline=el('due').value;save();el('settings').close();route();toast('Настройки сохранены');};
  document.querySelector('.skip').onclick=e=>{e.preventDefault();el('view').focus();};
  addEventListener('hashchange',route);save();route();
})();
