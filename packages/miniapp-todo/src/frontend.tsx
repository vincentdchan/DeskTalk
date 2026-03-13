import React from 'react';

function TodoApp() {
  return React.createElement(
    'div',
    { style: { padding: 24 } },
    React.createElement('h2', null, 'Todo'),
    React.createElement('p', null, 'Todo MiniApp — coming soon.'),
  );
}

export default TodoApp;
