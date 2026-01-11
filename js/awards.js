(function(){
  const openBtn = document.getElementById('openCertificate');
  const modal = document.getElementById('certificateModal');
  if(!modal) return;

  const close = () => {
    modal.classList.remove('isOpen');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  };
  const open = () => {
    modal.classList.add('isOpen');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
  };

  openBtn && openBtn.addEventListener('click', open);

  modal.addEventListener('click', (e) => {
    const target = e.target;
    if(target && target.getAttribute && target.getAttribute('data-close') === 'modal') {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.classList.contains('isOpen')) close();
  });
})();
