//NODECL defined by including file
// (nodecl sets "#define NODECL" for bug https://github.com/Motorola-Mobility/node-webcl/issues/41 )

#ifdef DEBUG
    // Variadic macros are not supported in OpenCL
    #define debug1(X)         printf(X)
    #define debug2(X,Y)       printf(X,Y)
    #define debug3(X,Y,Z)     printf(X,Y,Z)
    #define debug4(X,Y,Z,W)   printf(X,Y,Z,W)
    #define debug5(X,Y,Z,W,V) printf(X,Y,Z,W,V)
    #define debug6(U,V,W,X,Y,Z) printf(U,V,W,X,Y,Z)
#else
    #define debug1(X)
    #define debug2(X,Y)
    #define debug3(X,Y,Z)
    #define debug4(X,Y,Z,W)
    #define debug5(X,Y,Z,W,V)
    #define debug6(U,V,W,Y,X,Z)
#endif

// #define DEBUGONCE
#ifdef DEBUGONCE
    #define debugonce(X)      if(get_global_id(0) == 0) printf(X)
#else
    #define debugonce(X)
#endif
