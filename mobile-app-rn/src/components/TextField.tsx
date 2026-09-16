import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, fonts, glass, radii, whiteAlpha } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, style, onFocus, onBlur, accessibilityLabel, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          glass.inset,
          focused && styles.boxFocused,
          Boolean(error) && styles.boxError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={whiteAlpha(0.3)}
          accessibilityLabel={accessibilityLabel ?? label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    marginBottom: 6,
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: whiteAlpha(0.55),
  },
  box: {
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    height: 48,
    justifyContent: 'center',
  },
  boxFocused: {
    borderColor: `${colors.gold400}99`,
    backgroundColor: whiteAlpha(0.06),
  },
  boxError: {
    borderColor: `${colors.red400}80`,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.white,
    padding: 0,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.red400,
  },
  hintText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: whiteAlpha(0.4),
  },
});
