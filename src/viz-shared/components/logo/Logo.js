import styles from './logo.less';

export const Logo = ({ date = '' } = {}) => (
    <div className={styles['logo-container']}>
        <img src='img/logo_white_horiz.png' />
        <div className={styles['logo-version']}>{
            date
        }</div>
    </div>
);
