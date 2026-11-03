import { useEffect, useId, useRef, useState } from 'react';
import { renderTeamImage } from '../utils/teamImage';
import '../team-screenshot.css';

export default function TeamScreenshot({ snapshot, onClose }) {
  const dialog = useRef(null);
  const title = useId();
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [actualSize, setActualSize] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    let cancelled = false; let url;
    renderTeamImage(snapshot).then(result => {
      if (cancelled) return;
      url = URL.createObjectURL(result.blob);
      setImage({ ...result, url });
    }).catch(failure => { if (!cancelled) setError(failure.message || 'Could not create this team image.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [snapshot]);
  const download = () => {
    const link = document.createElement('a'); link.href = image.url; link.download = image.filename;
    document.body.append(link); link.click(); link.remove();
  };
  const keepFocus = event => {
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
  };
  return <dialog ref={dialog} className="team-screenshot-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={keepFocus}>
    <header><div><p className="eyebrow">TEAM SCREENSHOT</p><h2 id={title}>{snapshot.name}</h2><p>Only this team's parties are included. The PNG keeps its full resolution on any screen.</p></div><button className="user-button" onClick={onClose}>Close preview</button></header>
    <div className="team-screenshot-actions"><button className="user-button" disabled={!image} onClick={() => setActualSize(value => !value)}>{actualSize ? 'Fit to screen' : 'Actual size'}</button><button className="primary-button" disabled={!image} onClick={download}>Download PNG</button></div>
    {error ? <p className="formation-validation" role="alert">{error}</p> : image ? <div className={`team-screenshot-image${actualSize ? ' actual-size' : ''}`}><img src={image.url} alt={`${snapshot.name}: ${snapshot.parties.length} parties for ${snapshot.modeName}`} style={actualSize ? { width: '1440px' } : undefined} /></div> : <p className="screenshot-loading" role="status">Preparing your team image…</p>}
    <div className="screenshot-accessible-details">{snapshot.parties.map((party, index) => <section key={index}><h3>{party.name}</h3><ul>{party.slots.map((member, slot) => <li key={slot}>{member ? `${member.ign}, ${member.className}, ${member.gearScore} gear score, ${member.online ? 'Online' : 'Offline'}` : 'Open slot'}</li>)}</ul></section>)}</div>
  </dialog>;
}
