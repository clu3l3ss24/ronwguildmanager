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
    <header><div><p className="eyebrow">{snapshot.modeName} Roster</p><h2 id={title}>{snapshot.guildName}</h2><p>Every team and party is included in this compact roster image.</p></div><button className="user-button" onClick={onClose}>Close preview</button></header>
    <div className="team-screenshot-actions"><button className="user-button" disabled={!image} onClick={() => setActualSize(value => !value)}>{actualSize ? 'Fit to screen' : 'Actual size'}</button><button className="primary-button" disabled={!image} onClick={download}>Download roster PNG</button></div>
    {error ? <p className="formation-validation" role="alert">{error}</p> : image ? <div className={`team-screenshot-image${actualSize ? ' actual-size' : ''}`}><img src={image.url} alt={`${snapshot.guildName} ${snapshot.modeName} roster: ${snapshot.teams.length} teams, ${snapshot.teams.reduce((count, team) => count + team.parties.length, 0)} parties`} style={actualSize ? { width: '1920px' } : undefined} /></div> : <p className="screenshot-loading" role="status">Preparing your team roster image…</p>}
    <div className="screenshot-accessible-details">{snapshot.teams.map((team, teamIndex) => <section key={teamIndex}><h3>{team.name}</h3>{team.parties.map((party, partyIndex) => <div key={partyIndex}><h4>{party.name}</h4><ul>{party.slots.map((member, slot) => <li key={slot}>{member ? `${member.ign}, ${member.className}, ${member.gearScore} gear score, ${member.online ? 'Online' : 'Offline'}` : 'Open slot'}</li>)}</ul></div>)}</section>)}</div>
  </dialog>;
}
