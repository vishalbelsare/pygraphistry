console.log('micro bin path:', require.resolve('micro/bin/micro'));
console.log('user-service path:', require.resolve('@graphistry/user-service'));

module.exports = {
    apps: [
        {
            name: 'user-service',
            script: require.resolve('micro/bin/micro'),
            args: require.resolve('@graphistry/user-service')
        }
    ]
};
