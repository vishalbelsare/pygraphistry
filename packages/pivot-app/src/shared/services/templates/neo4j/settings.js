import stringhash from 'string-hash';

export const encodings = {
  point: {
    pointColor: node => {
      node.pointColor = stringhash(node.type || '') % 12;
    }
  }
};
