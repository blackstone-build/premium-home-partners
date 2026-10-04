import { useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type DimensionValue, type LayoutChangeEvent } from 'react-native';
import { Mono } from '../ui/primitives';
import { usePalette } from '../ui/theme';

export interface Col {
  label: string;
  /** Fixed width, or flex weight when `flex` is set. */
  width?: number;
  flex?: number;
  minWidth?: number;
  align?: 'left' | 'center';
  color?: string;
}

/** Office data table. Wide screens keep the row. Narrow screens stack each row into a card so every column stays on screen. */
export function Table({ cols, rows, minWidth = 760, rowPad = 8 }: { cols: Col[]; rows: ReactNode[][]; minWidth?: number; rowPad?: number }) {
  const c = usePalette();
  const { width: windowW } = useWindowDimensions();
  const [viewW, setViewW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== viewW) setViewW(w);
  };
  const available = viewW > 0 ? viewW : windowW;
  if (available === 0) return <View onLayout={onLayout} />;
  if (available < minWidth) {
    return (
      <View onLayout={onLayout} style={{ gap: 10 }}>
        {rows.map((r, ri) => (
          <View key={ri} style={{ borderRadius: 14, borderWidth: 1, borderColor: c.rule, backgroundColor: c.paper, paddingHorizontal: 12 }}>
            {r.map((child, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: rowPad,
                  borderTopWidth: i ? 1 : 0,
                  borderColor: c.rule,
                }}
              >
                <Mono size={10} medium tracking={0.06} color={cols[i]?.color ?? c.muted} style={{ width: 88 }}>
                  {cols[i]?.label}
                </Mono>
                <View style={{ flex: 1, minWidth: 0, alignItems: cols[i]?.align === 'center' ? 'center' : 'flex-start' }}>{child}</View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  // Pin the table to the visible width (or minWidth, whichever is larger) so long
  // cell text wraps inside its flex column instead of widening the scroll content.
  const tableW = viewW > 0 ? Math.max(minWidth, viewW) : undefined;
  const cell = (col: Col, child: ReactNode, key: string | number) => (
    <View
      key={key}
      style={{
        width: col.width as DimensionValue | undefined,
        flex: col.flex,
        minWidth: col.minWidth,
        alignItems: col.align === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
      }}
    >
      {child}
    </View>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1 }}
      onLayout={onLayout}
    >
      <View style={tableW ? { width: tableW } : { minWidth, flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.ink }}>
          {cols.map((col, i) =>
            cell(
              col,
              <Mono size={10} medium tracking={0.06} color={col.color ?? c.muted}>
                {col.label}
              </Mono>,
              i,
            ),
          )}
        </View>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: rowPad, borderBottomWidth: 1, borderColor: c.rule }}>
            {r.map((child, i) => cell(cols[i], child, i))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
