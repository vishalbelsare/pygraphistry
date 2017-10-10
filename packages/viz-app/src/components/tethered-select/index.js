import React from 'react';
import Select from 'react-select';
import styles from './styles.less';

class TetheredSelect extends Select {
  constructor(props, context) {
    super(props, context);
    this.menuY = 0;
    this.menuHeight = 200;
    this.windowHeight = 0;
    this.render = this._render;
  }
  componentDidMount() {
    super.componentDidMount.apply(this, arguments);
    this.storeMenuLayoutValues();
  }
  storeMenuLayoutValues() {
    const { menuContainer } = this;
    if (menuContainer) {
      this.menuHeight = menuContainer.offsetHeight;
    }
  }
  _render() {
    let isMenuFlipped = false;
    const { wrapper } = this;
    if (wrapper && typeof window !== 'undefined') {
      const windowHeight = window.innerHeight;
      const menuY = wrapper.getBoundingClientRect().bottom;
      isMenuFlipped = menuY + this.menuHeight > windowHeight;
    }
    const select = super.render.apply(this, arguments);
    const selectClassNames = select.props.className || '';
    return React.cloneElement(select, {
      className: `${selectClassNames} ${(isMenuFlipped && styles['is-menu-flipped']) || ''}`
    });
  }
}

export { TetheredSelect };
export default TetheredSelect;
