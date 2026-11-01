(()=>{
 const script=document.currentScript,key=script?.getAttribute('data-key');if(!script||!key||document.getElementById('oliveira-chat-launcher'))return;
 const origin=new URL(script.src).origin,frame=document.createElement('iframe'),button=document.createElement('button');
 button.id='oliveira-chat-launcher';button.type='button';button.textContent='✧';button.setAttribute('aria-label','Abrir atendimento');button.setAttribute('aria-expanded','false');
 Object.assign(button.style,{position:'fixed',right:'22px',bottom:'22px',width:'54px',height:'54px',border:'0',borderRadius:'50%',background:'#e11d48',color:'white',fontSize:'28px',boxShadow:'0 4px 20px #0002',cursor:'pointer',zIndex:'2147483000'});
 frame.src=`${origin}/widget.html?key=${encodeURIComponent(key)}&site=${encodeURIComponent(location.origin)}`;frame.title='Atendimento comercial com inteligência artificial';frame.setAttribute('referrerpolicy','strict-origin');
 Object.assign(frame.style,{position:'fixed',right:'22px',bottom:'88px',width:'min(380px, calc(100vw - 32px))',height:'min(570px, calc(100dvh - 120px))',border:'1px solid #e4e4e7',borderRadius:'14px',background:'white',boxShadow:'0 12px 45px #0002',display:'none',zIndex:'2147483000'});
 const toggle=(open)=>{frame.style.display=open?'block':'none';button.setAttribute('aria-expanded',String(open));button.textContent=open?'×':'✧';};button.addEventListener('click',()=>toggle(frame.style.display==='none'));
 window.addEventListener('message',event=>{if(event.origin!==origin||event.source!==frame.contentWindow)return;if(event.data?.type==='oliveira-close')toggle(false);if(event.data?.type==='oliveira-style'){const color=event.data.color;if(/^#[a-f0-9]{6}$/i.test(color))button.style.background=color;if(event.data.position==='left'){button.style.left='22px';button.style.right='auto';frame.style.left='22px';frame.style.right='auto';}}});
 document.body.append(button,frame);
})();
