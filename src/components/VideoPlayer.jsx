import React, { useContext } from 'react';
import { Grid, Typography} from '@mui/material';

import { SocketContext } from '../Context';
import logo from '../assests/logo.png'

const VideoPlayer = () => {
  const { name, callAccepted, userVideo, callEnded, call } = useContext(SocketContext);

  return (
    <Grid
  container
  spacing={0}
  direction="column"
  alignItems="center"
  justifyContent="center"
  style={{ minHeight: '60vh' }}
>
      {/* {stream && (
  
          <Grid item xs={12} md={6}>
            <Typography variant="h5" gutterBottom>{name || 'Name'}</Typography>
            <video playsInline muted ref={myVideo} autoPlay />
          </Grid>
      )} */}
{callAccepted && !callEnded ?
       (
          <Grid item xs={12} md={6}>
            <Typography variant="h5" gutterBottom>{call.name || 'Name'}</Typography>
            <video playsInline ref={userVideo} autoPlay />
          </Grid>
      ) : <img src={logo} style={{ borderRadius: '30%' }} alt="my profile" /> }
    <Typography variant="h5" gutterBottom>{name || 'Name'}</Typography>
    </Grid>
  );
};

export default VideoPlayer;
