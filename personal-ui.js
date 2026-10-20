const api=window.desktop;
const button=(label,handler)=>{const b=document.createElement('button'); b.textContent=label; b.onclick=handler; return b;};
const nav=document.createElement('div'); nav.className='personal-nav'; document.querySelector('header').insertBefore(nav,document.querySelector('#tab-strip'));
const dialog=document.createElement('dialog'); dialog.className='personal-dialog'; document.body.append(dialog);
let state, tab='calendar';
const error=document.createElement('p'); error.className='personal-error'; error.setAttribute('role','alert');
async function call(command,payload){const r=await api.personal(command,payload); if(!r.ok) {error.textContent=r.error; return null;} return r;}
function label(text,input){const l=document.createElement('label'); l.textContent=text; l.append(input); return l;}
function input(type,value=''){const i=document.createElement('input');i.type=type;i.value=value;return i;}
function localDate(iso){const d=new Date(iso);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function open(which){tab=which; document.querySelector('#liquid-home').click(); await api.browser('home'); await render(); if(!dialog.open)dialog.showModal();}
async function render(){
 state=await api.personal('state'); nav.replaceChildren(button('Calendar',()=>open('calendar')),button(state.profiles.find(p=>p.id===state.active)?.name||'Profiles',()=>open('profiles')));
 dialog.replaceChildren();error.textContent='';
 const head=document.createElement('div');head.className='personal-head';const h=document.createElement('h2');h.textContent=state.locked?'Profile locked':tab==='calendar'?'Your calendar':'Your profiles';head.append(h);
 if(!state.locked)head.append(button('Close',()=>dialog.close()));dialog.append(head,error);
 if(state.locked){const p=document.createElement('p');p.textContent='Verify with Windows Hello to open this profile, or choose another profile below.';dialog.append(p,button('Unlock with Windows Hello',async()=>{await call('unlock');}));tab='profiles';}
 if(tab==='profiles'){
  const description=document.createElement('p');description.textContent='Profiles keep separate conversations, calendar events and browser sessions.';dialog.append(description);
  for(const profile of state.profiles){const row=document.createElement('div');row.className='personal-row';const name=document.createElement('span');name.textContent=profile.name+(profile.hello?' · Windows Hello':'')+(profile.id===state.active?' · Current':'');row.append(name);if(profile.id!==state.active)row.append(button('Switch',async()=>{await call('switch',{id:profile.id});}));dialog.append(row);}
  if(!state.locked){const name=input('text');name.placeholder='New profile name';name.maxLength=60;const form=document.createElement('form');form.append(name,button('Create profile',()=>{}));form.onsubmit=async e=>{e.preventDefault();if(await call('create',{name:name.value}))await render();};dialog.append(form);
  }return;
 }
 const hint=document.createElement('p');hint.textContent='Saved only on this computer. Ask Liquid about your schedule in chat; add or edit events here.';dialog.append(hint);
 const form=document.createElement('form');form.className='event-form';let editing='';
 const title=input('text');title.required=true;title.maxLength=200;title.placeholder='What’s happening?';
 const start=input('datetime-local',localDate(Date.now()+3600000)),end=input('datetime-local',localDate(Date.now()+7200000));start.required=end.required=true;
 const notes=document.createElement('textarea');notes.placeholder='Notes or location';notes.maxLength=4000;
 const save=button('Save event',()=>{});form.append(label('Event',title),label('Starts',start),label('Ends',end),label('Notes',notes),save);
 form.onsubmit=async e=>{e.preventDefault();if(await call('save-event',{id:editing||undefined,title:title.value,start:new Date(start.value).toISOString(),end:new Date(end.value).toISOString(),notes:notes.value}))await render();};dialog.append(form);
 const data=await call('events');if(!data)return;
 const list=document.createElement('div');list.className='event-list';
 for(const event of data.events.sort((a,b)=>a.start.localeCompare(b.start))){const row=document.createElement('article');row.className='event-row';const name=document.createElement('strong');name.textContent=event.title;const time=document.createElement('p');time.textContent=new Date(event.start).toLocaleString()+' — '+new Date(event.end).toLocaleString();const details=document.createElement('p');details.textContent=event.notes;row.append(name,time,details,button('Edit',()=>{editing=event.id;title.value=event.title;start.value=localDate(event.start);end.value=localDate(event.end);notes.value=event.notes;save.textContent='Save changes';title.focus();}),button('Delete',async()=>{if(await call('delete-event',{id:event.id}))await render();}));list.append(row);}
 if(!data.events.length){const empty=document.createElement('p');empty.textContent='A little room in your day. No events yet.';list.append(empty);}dialog.append(list);
}
dialog.addEventListener('cancel',event=>{if(state?.locked)event.preventDefault();});
state=await api.personal('state');await render();if(state.locked){tab='profiles';await render();dialog.showModal();}
