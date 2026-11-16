import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { renderTeamImage } from '../utils/teamImage';
import '../team-screenshot.css';

const PARTIES_PER_PAGE = 16;

function paginateParties(teams) {
  const pages = [];
  let currentPage = [];
  let currentPagePartyCount = 0;
  for (const team of teams) {
    if (!team.parties.length) {
      currentPage.push({ ...team, parties: [] });
      continue;
    }
    for (let offset = 0; offset < team.parties.length; offset += 1) {
      if (currentPagePartyCount === PARTIES_PER_PAGE) {
        pages.push(currentPage);
        currentPage = [];
        currentPagePartyCount = 0;
      }
      const take = Math.min(PARTIES_PER_PAGE - currentPagePartyCount, team.parties.length - offset);
      currentPage.push({ ...team, parties: team.parties.slice(offset, offset + take) });
      currentPagePartyCount += take;
      offset += take - 1;
    }
  }
  if (currentPage.length || !pages.length) pages.push(currentPage);
  return pages;
}

export default function TeamScreenshot({ snapshot, onClose }) {
  const dialog = useRef(null);
  const title = useId();
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const pages = useMemo(() => paginateParties(snapshot.teams), [snapshot.teams]);
  const pageCount = pages.length;
  const pageSnapshot = useMemo(() => {
    const teams = pages[page] || [];
    const partyStart = pages.slice(0, page).reduce((count, priorPage) => count + priorPage.reduce((sum, team) => sum + team.parties.length, 0), 0) + 1;
    const pageParties = teams.reduce((count, team) => count + team.parties.length, 0);
    return { ...snapshot, teams, pageNumber: page + 1, pageCount, partyStart, partyEnd: partyStart + pageParties - 1, totalParties: snapshot.teams.reduce((count, team) => count + team.parties.length, 0) };
  }, [snapshot, pages, page, pageCount]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    let cancelled = false; let url;
    setImage(null); setError('');
    renderTeamImage(pageSnapshot).then(result => {
      if (cancelled) return;
      url = URL.createObjectURL(result.blob);
      setImage({ ...result, url });
    }).catch(failure => { if (!cancelled) setError(failure.message || 'Could not create this team image.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [pageSnapshot]);
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
    <header><div><p className="eyebrow">{snapshot.modeName} Roster</p><h2 id={title}>{snapshot.guildName}</h2><p className="screenshot-page-indicator">Page {page + 1} of {pageCount} | {pageSnapshot.totalParties ? `Parties ${pageSnapshot.partyStart}-${pageSnapshot.partyEnd} of ${pageSnapshot.totalParties}` : 'No parties'}</p></div><div className="screenshot-header-actions">{pageCount > 1 && <><button className="user-button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button><button className="user-button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>Next page</button></>}<button className="primary-button" disabled={!image} onClick={download}>Download PNG</button><button className="user-button" onClick={onClose}>Close preview</button></div></header>
    {error ? <p className="formation-validation" role="alert">{error}</p> : image ? <div className="team-screenshot-image"><img src={image.url} alt={`${snapshot.guildName} ${snapshot.modeName} roster, page ${page + 1} of ${pageCount}: ${pageSnapshot.totalParties ? `${pageSnapshot.partyStart} through ${pageSnapshot.partyEnd} of ${pageSnapshot.totalParties}` : 'no parties'}`} /></div> : <p className="screenshot-loading" role="status">Preparing your team roster image…</p>}
    <div className="screenshot-accessible-details">{pageSnapshot.teams.map((team, teamIndex) => <section key={teamIndex}><h3>{team.name}</h3>{team.parties.map((party, partyIndex) => <div key={partyIndex}><h4>{party.name}</h4><ul>{party.slots.map((member, slot) => <li key={slot}>{member ? `${member.ign}, ${member.className}, ${member.gearScore} gear score, ${member.online ? 'Online' : 'Offline'}` : 'Open slot'}</li>)}</ul></div>)}</section>)}</div>
  </dialog>;
}
