import {Composition} from 'remotion';
import {MunshiOSReel} from './MunshiOSReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MunshiOSReel"
      component={MunshiOSReel}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
