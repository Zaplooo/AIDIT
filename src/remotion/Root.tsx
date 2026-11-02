import React from 'react';
import {Composition} from 'remotion';
import {Edit, EditProps} from './Edit';
import {FORMATS, layout} from '../model';

export const Root: React.FC = () => (
	<Composition
		id="Edit"
		component={Edit}
		width={1080}
		height={1920}
		fps={30}
		durationInFrames={30}
		defaultProps={{project: null, mediaBase: '', quality: 'full'} as unknown as EditProps}
		calculateMetadata={({props}) => {
			const L = layout(props.project);
			const f = FORMATS[props.project.format];
			return {durationInFrames: L.durationInFrames, fps: L.fps, width: f.w, height: f.h};
		}}
	/>
);
