import React from 'react';
import {Home, LibraryPage} from './Home';
import {Editor} from './Editor';
import {ClientPage, ClientStyle} from './ClientPage';
import {NewVideo} from './NewVideo';

// Routing přes #: prázdný = domů, #c/<id> = klient, #c/<id>/styl = styl klienta, #new/<klient|_> = nahrání, #p/<id> = video (průvodce / editor)
const useHash = () => {
	const [h, setH] = React.useState(location.hash);
	React.useEffect(() => {
		const on = () => setH(location.hash);
		addEventListener('hashchange', on);
		return () => removeEventListener('hashchange', on);
	}, []);
	return h;
};

// když nějaká část rozhraní spadne, ukáže se hláška a jde pokračovat (místo prázdné obrazovky)
class Boundary extends React.Component<{children: React.ReactNode}, {err: Error | null}> {
	state = {err: null as Error | null};
	static getDerivedStateFromError(err: Error) {
		return {err};
	}
	render() {
		if (!this.state.err) return this.props.children;
		return (
			<div className="page narrow">
				<div className="card">
					<h3>Něco se pokazilo</h3>
					<p className="muted small" style={{whiteSpace: 'pre-wrap'}}>{this.state.err.message}</p>
					<button className="primary" onClick={() => this.setState({err: null})}>
						Zkusit znovu
					</button>{' '}
					<button onClick={() => (location.hash = '')}>Na úvod</button>
				</div>
			</div>
		);
	}
}

export const App: React.FC = () => {
	const hash = useHash();
	let view: React.ReactNode = <Home />;
	let m: RegExpMatchArray | null;
	if ((m = hash.match(/^#p\/([\w-]+)/))) view = <Editor key={m[1]} id={m[1]} />;
	else if ((m = hash.match(/^#c\/([\w-]+)\/styl/))) view = <ClientStyle key={m[1]} id={m[1]} />;
	else if ((m = hash.match(/^#c\/([\w-]+)/))) view = <ClientPage key={m[1]} id={m[1]} />;
	else if ((m = hash.match(/^#new\/([\w-]+)/))) view = <NewVideo key={m[1]} clientId={m[1] === '_' ? null : m[1]} />;
	else if (hash.startsWith('#knihovna')) view = <LibraryPage />;
	return <Boundary key={hash}>{view}</Boundary>;
};
