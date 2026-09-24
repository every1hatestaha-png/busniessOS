import {Composition} from 'remotion';
import {MunshiOSReelV2} from './MunshiOSReelV2';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MunshiOSReel"
      component={MunshiOSReelV2}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
