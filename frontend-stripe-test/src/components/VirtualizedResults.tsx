import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View, type FlatListProps, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

// Position is volatile and separated by actor and applied query. No user data,
// credentials or location is stored. Changing filters never reuses its offset.
const positions = new Map<string, number>();
const layouts = new Map<string, Map<string, number>>();
const positionLimit = 64;
function remember(key: string, offset: number) {
  if (!key || !Number.isFinite(offset) || offset < 0) return;
  positions.delete(key); positions.set(key, offset);
  if (positions.size > positionLimit) { const oldest = positions.keys().next().value!; positions.delete(oldest); layouts.delete(oldest); }
}
export function rememberedResultOffset(key: string) { return positions.get(key) || 0; }
export function clearResultPositions() { positions.clear(); layouts.clear(); }

export type VirtualizedResultsProps<T> = Omit<FlatListProps<T>, "onScroll" | "onContentSizeChange"> & {
  restoreKey: string;
  estimatedItemHeight?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: (width: number, height: number) => void;
};

// Must own the vertical scroll. Pass data records and a lazy renderItem; never
// feed an array of already rendered JSX or nest inside a vertical ScrollView.
export default function VirtualizedResults<T>({ restoreKey, estimatedItemHeight = 320, onScroll, onContentSizeChange, ...props }: VirtualizedResultsProps<T>) {
  const list = useRef<FlatList<T>>(null);
  const currentKey = useRef(restoreKey);
  const offset = useRef(rememberedResultOffset(restoreKey));
  const restoring = useRef(true);
  const dataLength = useRef(props.data?.length || 0); dataLength.current = props.data?.length || 0;
  const [layoutRevision, setLayoutRevision] = useState(0);
  const heights = layouts.get(restoreKey) || new Map<string, number>(); layouts.set(restoreKey, heights);
  const keyFor = (item: T, index: number) => props.keyExtractor ? props.keyExtractor(item, index) : String(index);
  const offsets = useMemo(() => {
    const values = [0];
    for (let index = 0; index < (props.data?.length || 0); index++) values.push(values[index] + (heights.get(keyFor(props.data![index], index)) || estimatedItemHeight));
    return values;
  }, [props.data, props.keyExtractor, heights, layoutRevision, estimatedItemHeight]);
  if (currentKey.current !== restoreKey) {
    remember(currentKey.current, offset.current);
    currentKey.current = restoreKey; offset.current = rememberedResultOffset(restoreKey); restoring.current = true;
  }
  useEffect(() => () => { remember(currentKey.current, offset.current); }, []);
  function restore() {
    if (currentKey.current !== restoreKey || !restoring.current || !dataLength.current) return;
    restoring.current = false;
    list.current?.scrollToOffset({ offset: offset.current, animated: false });
  }
  return <FlatList<T>
    {...props}
    key={restoreKey}
    ref={list}
    initialNumToRender={props.initialNumToRender ?? 8}
    maxToRenderPerBatch={props.maxToRenderPerBatch ?? 8}
    windowSize={props.windowSize ?? 5}
    updateCellsBatchingPeriod={props.updateCellsBatchingPeriod ?? 40}
    removeClippedSubviews={false}
    keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || "handled"}
    getItemLayout={props.getItemLayout || ((_data, index) => ({ index, offset: offsets[index], length: offsets[index + 1] - offsets[index] }))}
    renderItem={info => <View onLayout={event => {
      if (currentKey.current !== restoreKey) return;
      const height = event.nativeEvent.layout.height, key = keyFor(info.item, info.index);
      if (height > 0 && Math.abs((heights.get(key) || estimatedItemHeight) - height) > 1) { heights.set(key, height); setLayoutRevision(value => value + 1); }
    }}>{props.renderItem?.(info)}</View>}
    scrollEventThrottle={16}
    onLayout={event => { if (currentKey.current !== restoreKey) return; props.onLayout?.(event); restore(); }}
    onContentSizeChange={(width, height) => { if (currentKey.current !== restoreKey) return; restore(); onContentSizeChange?.(width, height); }}
    onScroll={event => {
      if (currentKey.current !== restoreKey) return;
      if (!restoring.current) { offset.current = Math.max(0, event.nativeEvent.contentOffset.y); remember(currentKey.current, offset.current); }
      onScroll?.(event);
    }}
  />;
}
