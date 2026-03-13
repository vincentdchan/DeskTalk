import React from 'react';

function NoteApp() {
  return React.createElement(
    'div',
    { style: { padding: 24 } },
    React.createElement('h2', null, 'Note'),
    React.createElement('p', null, 'Note MiniApp — coming soon.'),
  );
}

export default NoteApp;
