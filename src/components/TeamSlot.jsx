import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import MemberCard from './MemberCard';

export function DraggableMember({ member, disabled = false, lowGear = false, longOffline = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id, data: { member }, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? 'dragging' : ''}><MemberCard member={member} compact lowGear={lowGear} longOffline={longOffline} /></div>;
}
export default function TeamSlot({ id, member, index, disabled = false, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <div ref={setNodeRef} className={`team-slot ${isOver ? 'over' : ''}`}>{member ? <><DraggableMember member={member} disabled={disabled} /><button type="button" className="remove-slot-member" disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onRemove?.(member); }} aria-label={`Remove ${member.ign} from party`} title={`Remove ${member.ign} from party`}>×</button></> : <span><b>{index + 1}</b> Open slot</span>}</div>;
}
