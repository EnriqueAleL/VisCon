/* A short-lived frame bridges document loading after the real 3D camera move.
   No persistent image or navigation state is created. */
(function () {
  if (location.pathname !== '/arena' || new URLSearchParams(location.search).get('entry') !== 'ship') return;
  try {
    var frame=JSON.parse(sessionStorage.getItem('viscon-boarding-frame') || 'null');
    sessionStorage.removeItem('viscon-boarding-frame');
    if(!frame || Date.now()-frame.at>15000 || typeof frame.image!=='string' || !frame.image.startsWith('data:image/jpeg;base64,') || frame.image.length>4000000)return;
    var image=document.createElement('img');image.id='boarding-frame';image.alt='';image.setAttribute('aria-hidden','true');image.src=frame.image;
    Object.assign(image.style,{position:'fixed',inset:'0',width:'100%',height:'100%',objectFit:'fill',zIndex:'900',pointerEvents:'none'});
    document.body.append(image);
    setTimeout(function(){image.remove();},12000);
  } catch (_) { /* The functional page remains independent of this transition. */ }
})();
