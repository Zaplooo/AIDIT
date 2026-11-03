import React from 'react';
import {Icon} from './Mocks';

// horní menu: logo, Domů, Knihovna, Nové video
export const TopNav: React.FC = () => {
	const h = location.hash;
	return (
		<nav className="topnav">
			<a className="brand" href="#">
				<img src="/aidit-logo.png" alt="" className="brand-logo" /> AIDIT
			</a>
			<a className={!h || h === '#' ? 'on' : ''} href="#">
				Domů
			</a>
			<a className={h.startsWith('#knihovna') ? 'on' : ''} href="#knihovna">
				Knihovna a můj styl
			</a>
			<div style={{flex: 1}} />
			<button className="primary" onClick={() => (location.hash = '#new/_')}>
				<Icon name="plus" /> Nové video
			</button>
		</nav>
	);
};
