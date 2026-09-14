import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, glass, glowGold, radii, whiteAlpha } from '../theme';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const sizeHeights: Record<Size, number> = { md: 48, sm: 36 };
const sizeFontSizes: Record<Size, number> = { md: 14, sm: 12 };

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const height = sizeHeights[size];
  const fontSize = sizeFontSizes[size];

  const content = (
    <View style={styles.contentRow}>
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.ink950 : colors.gold100} />
      ) : (
        <Text
          style={[
            styles.label,
            { fontSize },
            variant === 'primary' || variant === 'danger'
              ? { color: colors.ink950 }
              : variant === 'ghost'
                ? { color: colors.gold100 }
                : { color: whiteAlpha(0.7) },
          ]}
        >
          {children}
        </Text>
      )}
    </View>
  );

  if (variant === 'primary' || variant === 'danger') {
    const gradientColors: [string, string] =
      variant === 'primary' ? [colors.gold300, colors.gold600] : [colors.red400, colors.red500];
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={[{ opacity: isDisabled ? 0.5 : 1 }, style]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.base, glowGold, { height }]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        { height, opacity: isDisabled ? 0.5 : 1 },
        variant === 'ghost' ? glass.inset : undefined,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.sansMedium,
    letterSpacing: 0.3,
  },
});
