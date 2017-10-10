import styles from './styles.less';
import { Label, ProgressBar } from 'react-bootstrap';
import { TrackInitProgress } from './track-init-progress';

const TimeoutProgressIndicator = TrackInitProgress()(ProgressIndicator);

export function Session({ status = 'primary', message = '', progress = 100 }) {
  if (status === 'init') {
    status = progress === 100 ? 'success' : 'default';
    if (message && typeof progress === 'number') {
      message = `${message} (${Math.round(progress)}%)`;
    }
  }

  if (status === 'success') {
    return null;
  }

  return (
    <TimeoutProgressIndicator
      className={styles['session']}
      style={{ transform: `translate3d(-6px, 3px, 0)` }}
      status={status}
      message={message}
      progress={progress}
    />
  );
}

const statusStyle = { marginRight: 3 };
const defaultStatusStyle = { backgroundColor: 'transparent', marginRight: 3 };

function ProgressIndicator({
  className,
  style = {},
  message = `Locating Graphistry's farm`,
  reload,
  progress = 100,
  status = 'default'
}) {
  return (
    <p
      onClick={reload}
      className={className}
      style={{
        ...style,
        cursor: (reload && 'pointer') || 'initial'
      }}>
      <Label bsStyle={status} style={(status === 'default' && defaultStatusStyle) || statusStyle}>
        {message}
      </Label>
      {(status === 'default' &&
        ((progress !== 100 && !!message && <span className="Select-loading" />) || (
          <i className={styles['vbo-loading'] + ' fa fa-bolt'} />
        ))) ||
        undefined}
    </p>
  );
}
