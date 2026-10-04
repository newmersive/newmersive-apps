import React, {useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {View} from "react-native";
import {rowWindow,type ScrollWindow} from "../utils/scrollWindow";

type Props<T> = {
  data:T[]; keyExtractor:(item:T)=>string; renderItem:(item:T,index:number)=>React.ReactNode;
  viewport:ScrollWindow; queryKey:string; estimatedHeight?:number; pinnedId?:string|null;
  onOffsets?:(offsets:Record<string,number>)=>void; testID?:string;
};

// Uses the containing ScrollView's viewport. It never nests another scroller
// or builds JSX for all records before choosing the visible rows.
export default function WindowedRows<T>({data,keyExtractor,renderItem,viewport,queryKey,estimatedHeight=360,pinnedId,onOffsets,testID}:Props<T>) {
  const position=useSyncExternalStore(viewport.subscribe,viewport.getSnapshot,viewport.getSnapshot);
  const container=useRef<View>(null),heights=useRef(new Map<string,number>());
  const activeKey=useRef(queryKey),mounted=useRef(true),measurement=useRef(0);activeKey.current=queryKey;
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;measurement.current++;};},[]);
  const [revision,setRevision]=useState(0),[origin,setOrigin]=useState(0);
  useLayoutEffect(()=>{heights.current.clear();setRevision(value=>value+1);},[queryKey]);
  const keys=useMemo(()=>data.map(keyExtractor),[data,keyExtractor]);
  const offsets=useMemo(()=>{const values=[0];keys.forEach(key=>values.push(values[values.length-1]+(heights.current.get(key)||estimatedHeight)));return values;},[keys,revision,estimatedHeight]);
  const indices=rowWindow(offsets,position.y-origin,position.height,700,pinnedId?keys.indexOf(pinnedId):-1);
  const measureOrigin=()=>{
    const ticket=++measurement.current,before=viewport.getSnapshot();
    container.current?.measureInWindow((_x,y)=>{
      const current=viewport.getSnapshot();
      if(mounted.current&&activeKey.current===queryKey&&ticket===measurement.current&&current.y===before.y)setOrigin(Math.max(0,y-current.containerY+current.y));
    });
  };
  useLayoutEffect(measureOrigin,[position.containerY,data.length,queryKey]);
  useLayoutEffect(()=>{onOffsets?.(Object.fromEntries(keys.map((key,index)=>[key,origin+offsets[index]])));},[keys,offsets,origin,onOffsets]);
  const children:React.ReactNode[]=[];let previous=0;
  for(const index of indices){
    if(offsets[index]>previous)children.push(<View key={`gap:${keys[index]}`} style={{height:offsets[index]-previous}} pointerEvents="none" />);
    children.push(<View key={keys[index]} testID={testID?`${testID}-row`:undefined} onLayout={event=>{
      const height=event.nativeEvent.layout.height;
      if(height>0&&Math.abs((heights.current.get(keys[index])||estimatedHeight)-height)>1){heights.current.set(keys[index],height);setRevision(value=>value+1);}
    }}>{renderItem(data[index],index)}</View>);
    previous=offsets[index+1];
  }
  if(offsets[offsets.length-1]>previous)children.push(<View key="tail" style={{height:offsets[offsets.length-1]-previous}} pointerEvents="none" />);
  return <View ref={container} onLayout={measureOrigin} testID={testID}>{children}</View>;
}
