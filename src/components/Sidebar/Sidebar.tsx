import { useEffect, useState } from "react";
import {
  Search,
  FolderPlus,
  FilePlus,
  FolderClosed,
  FolderOpen,
  FileText,
  ChevronRight,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import {
  useLibraryStore,
  type TreeNode,
  collectMatches,
} from "../../stores/libraryStore";
import { useContextMenu, type MenuItem } from "../../stores/contextMenuStore";

export function Sidebar() {
  const { root, tree, search, setSearch, createNote, createFolder, closeLibrary } =
    useLibraryStore();
  const [newItem, setNewItem] = useState<null | "note" | "folder">(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const saved = localStorage.getItem("markly:library");
    if (saved && !useLibraryStore.getState().root) {
      useLibraryStore.getState().openLibrary(saved);
    }
  }, []);

  if (!root) return <NoLibrary />;

  const filtered = search.trim()
    ? collectMatches(tree, search.trim().toLowerCase())
    : tree;

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-search">
          <Search size={13} style={{ color: "var(--fg-muted)", flexShrink: 0 }} />
          <input
            placeholder="搜索文件…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className="icon-btn"
          title="新建笔记"
          onClick={() => {
            setNewItem("note");
            setNewName("");
          }}
        >
          <FilePlus size={15} />
        </button>
        <button
          className="icon-btn"
          title="新建文件夹"
          onClick={() => {
            setNewItem("folder");
            setNewName("");
          }}
        >
          <FolderPlus size={15} />
        </button>
        <button className="icon-btn" title="关闭文件库" onClick={closeLibrary}>
          <X size={15} />
        </button>
      </div>

      {newItem && (
        <NewItemInput
          kind={newItem}
          value={newName}
          onChange={setNewName}
          onCancel={() => setNewItem(null)}
          onSubmit={async (name) => {
            try {
              if (newItem === "note") await createNote(root, name);
              else await createFolder(root, name);
            } catch (e) {
              console.error(e);
            }
            setNewItem(null);
          }}
        />
      )}

      <div className="sidebar-content">
        {search.trim() ? (
          filtered.length === 0 ? (
            <p className="sidebar-empty">没有匹配的文件</p>
          ) : (
            filtered.map((n) => <FileRow key={n.path} node={n} depth={0} flat />)
          )
        ) : (
          tree.map((n) => <TreeNodeView key={n.path} node={n} depth={0} />)
        )}
      </div>
    </>
  );
}

function NoLibrary() {
  return (
    <div className="sidebar-content" style={{ display: "grid", placeItems: "center" }}>
      <p className="sidebar-empty">尚未打开文件夹</p>
    </div>
  );
}

function NewItemInput({
  kind,
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  kind: "note" | "folder";
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <div className="new-item">
      <input
        autoFocus
        placeholder={kind === "note" ? "笔记名.md" : "文件夹名"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => value.trim() && onSubmit(value.trim())}
      />
    </div>
  );
}

/** 文件树右键菜单 */
function showTreeMenu(e: React.MouseEvent, node: TreeNode) {
  e.preventDefault();
  e.stopPropagation();
  const store = useLibraryStore.getState();
  const items: MenuItem[] = [];
  if (node.isDir) {
    items.push(
      {
        label: "新建笔记",
        icon: "newNote",
        action: () => {
          store.select(node.path);
          store.toggleExpand(node.path);
          store.setPendingCreate({ dir: node.path, kind: "note" });
        },
      },
      {
        label: "新建文件夹",
        icon: "newFolder",
        action: () => {
          store.select(node.path);
          store.toggleExpand(node.path);
          store.setPendingCreate({ dir: node.path, kind: "folder" });
        },
      },
      { separator: true },
    );
  } else {
    items.push({
      label: "打开",
      icon: "openLink",
      action: () => store.openNote(node.path).catch(console.error),
    });
  }
  items.push(
    {
      label: "重命名",
      icon: "rename",
      action: () => store.setRenaming(node.path),
    },
    { label: "删除", icon: "delete", danger: true, action: () => store.deleteNode(node) },
  );
  useContextMenu.getState().show(e.clientX, e.clientY, items);
}

function TreeNodeView({ node, depth }: { node: TreeNode; depth: number }) {
  const { expanded, toggleExpand, selected, select, openNote, renamingPath } = useLibraryStore();
  const [creating, setCreating] = useState<null | "note" | "folder">(null);
  const [newName, setNewName] = useState("");
  const pendingCreate = useLibraryStore((s) => s.pendingCreate);
  const isOpen = expanded.has(node.path);

  useEffect(() => {
    if (pendingCreate?.dir === node.path) {
      setCreating(pendingCreate.kind);
      setNewName("");
      useLibraryStore.getState().setPendingCreate(null);
    }
  }, [pendingCreate, node.path]);

  return (
    <div>
      <NodeRow
        node={node}
        depth={depth}
        active={selected === node.path}
        open={isOpen}
        onClick={() => {
          if (node.isDir) toggleExpand(node.path);
          else {
            select(node.path);
            openNote(node.path).catch(console.error);
          }
        }}
        renaming={renamingPath === node.path}
        onContextMenu={(e) => showTreeMenu(e, node)}
        onNewNote={() => {
          setCreating("note");
          setNewName("");
        }}
        onNewFolder={() => {
          setCreating("folder");
          setNewName("");
        }}
      />
      {creating && (
        <NewItemInput
          kind={creating}
          value={newName}
          onChange={setNewName}
          onCancel={() => setCreating(null)}
          onSubmit={async (name) => {
            const { createNote, createFolder } = useLibraryStore.getState();
            try {
              if (creating === "note") await createNote(node.path, name);
              else await createFolder(node.path, name);
            } catch (e) {
              console.error(e);
            }
            setCreating(null);
          }}
        />
      )}
      {node.isDir &&
        isOpen &&
        node.children?.map((c) => <TreeNodeView key={c.path} node={c} depth={depth + 1} />)}
    </div>
  );
}

function NodeRow({
  node,
  depth,
  active,
  open,
  onClick,
  onContextMenu,
  renaming,
  onNewNote,
  onNewFolder,
}: {
  node: TreeNode;
  depth: number;
  active: boolean;
  open: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  renaming: boolean;
  onNewNote?: () => void;
  onNewFolder?: () => void;
}) {
  const { renameNode, deleteNode } = useLibraryStore();

  if (renaming) {
    return (
      <div className="new-item" style={{ paddingLeft: 14 + depth * 14 }}>
        <input
          autoFocus
          defaultValue={node.name}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              renameNode(node.path, e.currentTarget.value.trim()).catch(console.error);
              useLibraryStore.getState().setRenaming(null);
            }
            if (e.key === "Escape") useLibraryStore.getState().setRenaming(null);
          }}
          onBlur={() => useLibraryStore.getState().setRenaming(null)}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx("tree-row", active && "active")}
      style={{ paddingLeft: 6 + depth * 14 }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={node.path}
    >
      {node.isDir ? (
        <>
          <ChevronRight
            size={13}
            className={clsx("tree-chevron", open && "open")}
            style={{ flexShrink: 0 }}
          />
          {open ? (
            <FolderOpen size={15} className="tree-icon" />
          ) : (
            <FolderClosed size={15} className="tree-icon" />
          )}
        </>
      ) : (
        <FileText size={15} className="tree-icon" />
      )}
      <span className="tree-name">{node.name}</span>
      {node.isDir && (
        <span className="tree-actions">
          {onNewNote && (
            <button
              className="icon-btn"
              title="新建笔记"
              onClick={(e) => {
                e.stopPropagation();
                onNewNote();
              }}
            >
              <FilePlus size={13} />
            </button>
          )}
          {onNewFolder && (
            <button
              className="icon-btn"
              title="新建文件夹"
              onClick={(e) => {
                e.stopPropagation();
                onNewFolder();
              }}
            >
              <FolderPlus size={13} />
            </button>
          )}
        </span>
      )}
      {!node.isDir && (
        <button
          className="icon-btn tree-del"
          title="删除"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode(node).catch(console.error);
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function FileRow({ node, depth, flat }: { node: TreeNode; depth: number; flat?: boolean }) {
  const { selected, select, openNote } = useLibraryStore();
  return (
    <div
      className={clsx("tree-row", selected === node.path && "active")}
      style={{ paddingLeft: 6 + (flat ? 0 : depth * 14) + 17 }}
      onClick={() => {
        select(node.path);
        openNote(node.path).catch(console.error);
      }}
      onContextMenu={(e) => showTreeMenu(e, node)}
      title={node.path}
    >
      <FileText size={15} className="tree-icon" />
      <span className="tree-name">{node.name}</span>
    </div>
  );
}
