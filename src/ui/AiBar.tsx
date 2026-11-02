import React from 'react';
import type {ChatMsg, Preview} from '../api';
import {CATALOG, HookVisual, Setup, ZoomStyle} from '../setup';
import {Icon} from './Mocks';
import {GfxCard, HookCard, PlayButton, ZoomCard} from './previews';

// AI lišta dole – vždy po ruce. Co napíšeš, AI rovnou promítne do nastavení / střihu.
export const AiBar: React.FC<{
	messages: ChatMsg[];
	busy: boolean;
	onSend: (text: string) => void;
	placeholder: string;
	setup?: Setup;
	actions?: React.ReactNode;
	big?: boolean;
	onPreview?: (p: Preview) => void;
}> = ({messages, busy, onSend, placeholder, setup, actions, big, onPreview}) => {
	const [text, setText] = React.useState('');
	// v kompaktní liště je chat schovaný, dokud si autor nenapíše (nová zpráva ho otevře)
	const [open, setOpen] = React.useState(Boolean(big) || messages.some((m) => m.role === 'user'));
	const count = React.useRef(messages.length);
	React.useEffect(() => {
		if (messages.length > count.current) setOpen(true);
		count.current = messages.length;
	}, [messages.length]);
	const end = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		end.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
	}, [messages, busy, open]);
	const send = () => {
		if (!text.trim() || busy) return;
		onSend(text.trim());
		setText('');
		setOpen(true);
	};
	const shown = big ? messages : messages.slice(-4);
	const last = messages[messages.length - 1];
	return (
		<div className={'aibar' + (big ? ' big' : '')}>
			{messages.length && open ? (
				<div className="aibar-thread">
					{!big ? (
						<button className="ghost small aibar-hide" onClick={() => setOpen(false)}>
							Skrýt chat
						</button>
					) : null}
					{shown.map((m, i) => (
						<div key={i} className={'msg ' + m.role}>
							{m.role === 'ai' ? (
								<span className="av">
									<Icon name="ai" />
								</span>
							) : null}
							<div className="bubble">
								{m.text}
								{m.previews?.length && setup ? <Previews list={m.previews} setup={setup} onPick={onPreview} /> : null}
							</div>
						</div>
					))}
					{busy ? (
						<div className="msg ai">
							<span className="av">
								<Icon name="ai" />
							</span>
							<div className="bubble typing">
								<i />
								<i />
								<i />
							</div>
						</div>
					) : null}
					<div ref={end} />
				</div>
			) : null}
			{!open && !big && messages.length ? (
				<button className="aibar-peek" onClick={() => setOpen(true)}>
					<Icon name="chat" /> <span>{last.role === 'ai' ? last.text : 'Ukázat chat s AI'}</span>
				</button>
			) : null}
			<div className="aibar-input">
				<span className="aibar-ico">
					<Icon name="ai" />
				</span>
				<textarea
					rows={big ? 3 : 1}
					value={text}
					placeholder={placeholder}
					onChange={(e) => setText(e.target.value)}
					onFocus={() => setOpen(true)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							send();
						}
					}}
				/>
				{actions}
				<button className="primary" onClick={send} disabled={busy || !text.trim()}>
					<Icon name="send" /> Poslat
				</button>
			</div>
		</div>
	);
};

const Previews: React.FC<{list: Preview[]; setup: Setup; onPick?: (p: Preview) => void}> = ({list, setup, onPick}) => (
	<div className="ai-previews">
		{list.map((p, i) => {
			const pick = () => onPick?.(p);
			if (p.kind === 'gfx' && CATALOG.gfx.some((g) => g.type === p.id)) return <GfxCard key={i} type={p.id} setup={setup} compact onClick={pick} />;
			if (p.kind === 'zoom' && CATALOG.zooms.some((g) => g.id === p.id)) return <ZoomCard key={i} id={p.id as ZoomStyle} setup={setup} compact onClick={pick} />;
			if (p.kind === 'hook' && CATALOG.hooks.some((g) => g.id === p.id)) return <HookCard key={i} id={p.id as HookVisual} setup={setup} compact onClick={pick} />;
			if (p.kind === 'color')
				return (
					<span key={i} className="pv-chip" onClick={pick}>
						<span className="dot-c" style={{background: p.id}} /> {CATALOG.colors.find((c) => c.hex.toLowerCase() === p.id.toLowerCase())?.name ?? p.id}
					</span>
				);
			if (p.kind === 'music' && p.id.startsWith('music/'))
				return (
					<span key={i} className="pv-chip">
						<PlayButton src={'/' + p.id} /> {p.id.replace(/^music\/|_n\.mp3$/g, '')}
					</span>
				);
			return (
				<span key={i} className="pv-chip" onClick={pick}>
					{p.id}
				</span>
			);
		})}
	</div>
);
