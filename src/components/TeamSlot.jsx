import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import MemberCard from './MemberCard';

export function DraggableMember({ member }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id, data: { member } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? 'dragging' : ''}><MemberCard member={member} compact /></div>;
}
export default function TeamSlot({ id, member, index }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`team-slot ${isOver ? 'over' : ''}`}>{member ? <DraggableMember member={member} /> : <span><b>{index + 1}</b> Open slot</span>}</div>;
}
