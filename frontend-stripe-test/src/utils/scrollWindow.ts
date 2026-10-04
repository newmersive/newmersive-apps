export type ScrollWindowSnapshot = { y:number; height:number; containerY:number };
export function createScrollWindow() {
  let snapshot:ScrollWindowSnapshot = {y:0,height:700,containerY:0};
  const listeners = new Set<()=>void>();
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    update:(next:Partial<ScrollWindowSnapshot>)=>{
      const value={...snapshot,...next};
      if(value.y===snapshot.y&&value.height===snapshot.height&&value.containerY===snapshot.containerY)return;
      snapshot=value; listeners.forEach(listener=>listener());
    },
  };
}
export type ScrollWindow = ReturnType<typeof createScrollWindow>;

export function rowWindow(offsets:number[], top:number, height:number, overscan=700, pinnedIndex=-1) {
  const length=offsets.length-1;
  if(!length)return [];
  const lower=Math.max(0,top-overscan), upper=Math.max(0,top+height+overscan);
  const bound=(value:number)=>{let lo=0,hi=length;while(lo<hi){const mid=(lo+hi)>>>1;if(offsets[mid+1]<value)lo=mid+1;else hi=mid;}return lo;};
  // Layout can shorten the content before native scroll reports its clamped
  // offset. Keep the last row mounted during that frame instead of a blank list.
  const start=Math.min(length-1,bound(lower)),end=Math.min(length,bound(upper)+1);
  const indices=Array.from({length:Math.max(0,end-start)},(_,i)=>start+i);
  if(pinnedIndex>=0&&pinnedIndex<length&&!indices.includes(pinnedIndex))indices.push(pinnedIndex);
  return indices.sort((a,b)=>a-b);
}
