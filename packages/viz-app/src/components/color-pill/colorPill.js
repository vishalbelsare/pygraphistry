import React from 'react';
import Color from 'color';
import styles from './styles.less';

export const ColorPill = ({ color }) => (
  <span
    className={styles['color-pill']}
    style={{ backgroundColor: new Color(color).rgbString() }}
  />
);
