import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  SimpleChanges,
} from '@angular/core';

export interface AutocompleteOption {
  id: string;
  label: string;
  subLabel?: string;
}

@Directive({
  selector: 'input[appAutocomplete]',
  standalone: true,
})
export class AutocompleteDirective implements OnInit, OnChanges, OnDestroy {
  @Input('appAutocomplete') options: AutocompleteOption[] = [];
  @Input() selectedId: string | null = null;
  @Input() allowEmpty = true;

  @Output() selectedIdChange = new EventEmitter<string | null>();
  @Output() validityChange = new EventEmitter<boolean>();

  private dropdownEl: HTMLElement | null = null;
  private filteredOptions: AutocompleteOption[] = [];
  private activeIndex = -1;
  private isOpen = false;

  private documentClickListener: (() => void) | null = null;

  constructor(
    private readonly el: ElementRef<HTMLInputElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngOnInit() {
    this.createDropdown();
    this.updateInitialValue();

    // Close on outside click
    this.documentClickListener = this.renderer.listen('document', 'click', (event: MouseEvent) => {
      if (!this.el.nativeElement.contains(event.target as Node) && !this.dropdownEl?.contains(event.target as Node)) {
        this.closeDropdown();
        this.validateCurrentText();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedId'] || changes['options']) {
      this.updateInitialValue();
    }
  }

  ngOnDestroy() {
    if (this.documentClickListener) this.documentClickListener();
    if (this.dropdownEl && this.dropdownEl.parentNode) {
      this.dropdownEl.parentNode.removeChild(this.dropdownEl);
    }
  }

  private updateInitialValue() {
    if (this.selectedId) {
      const match = this.options.find((o) => o.id === this.selectedId);
      if (match) {
        this.el.nativeElement.value = match.label;
        this.validityChange.emit(true);
        return;
      }
    } else if (this.allowEmpty && !this.el.nativeElement.value.trim()) {
      this.validityChange.emit(true);
    }
  }

  private isReadOnlyOrDisabled(): boolean {
    return this.el.nativeElement.disabled || this.el.nativeElement.readOnly;
  }

  @HostListener('click')
  onClick() {
    if (this.isReadOnlyOrDisabled()) return;
    if (!this.isOpen) {
      this.showOptionsForCurrentInput();
    }
  }

  @HostListener('focus')
  onFocus() {
    if (this.isReadOnlyOrDisabled()) return;
    this.showOptionsForCurrentInput();
  }

  private showOptionsForCurrentInput() {
    const query = this.el.nativeElement.value.trim().toLowerCase();
    this.activeIndex = -1;

    if (!query) {
      this.filteredOptions = this.options.slice(0, 30);
    } else {
      this.filteredOptions = this.options.filter(
        (o) => o.label.toLowerCase().includes(query) || o.subLabel?.toLowerCase().includes(query),
      );
    }

    this.renderDropdown();
  }

  @HostListener('input')
  onInput() {
    if (this.isReadOnlyOrDisabled()) return;
    const query = this.el.nativeElement.value.trim().toLowerCase();
    this.activeIndex = -1;

    if (!query) {
      this.selectedId = null;
      this.selectedIdChange.emit(null);
      this.validityChange.emit(this.allowEmpty);
      this.filteredOptions = this.options.slice(0, 30);
      this.renderDropdown();
      return;
    }

    this.filteredOptions = this.options.filter(
      (o) => o.label.toLowerCase().includes(query) || o.subLabel?.toLowerCase().includes(query),
    );

    // Exact match check
    const exact = this.options.find((o) => o.label.toLowerCase() === query);
    if (exact) {
      this.selectedId = exact.id;
      this.selectedIdChange.emit(exact.id);
      this.validityChange.emit(true);
    } else {
      this.selectedId = null;
      this.selectedIdChange.emit(null);
      this.validityChange.emit(false);
    }

    this.renderDropdown();
  }

  @HostListener('blur')
  onBlur() {
    // Delay slightly to permit click on dropdown item
    setTimeout(() => {
      this.validateCurrentText();
    }, 200);
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (this.isReadOnlyOrDisabled()) return;
    if (!this.isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.showOptionsForCurrentInput();
      return;
    }

    if (!this.isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.filteredOptions.length > 0) {
        this.activeIndex = (this.activeIndex + 1) % this.filteredOptions.length;
        this.updateActiveHighlight();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.filteredOptions.length > 0) {
        this.activeIndex = (this.activeIndex - 1 + this.filteredOptions.length) % this.filteredOptions.length;
        this.updateActiveHighlight();
      }
    } else if (event.key === 'Enter') {
      if (this.activeIndex >= 0 && this.activeIndex < this.filteredOptions.length) {
        event.preventDefault();
        this.selectOption(this.filteredOptions[this.activeIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDropdown();
    }
  }

  private validateCurrentText() {
    const text = this.el.nativeElement.value.trim();
    if (!text) {
      if (this.allowEmpty) {
        this.selectedId = null;
        this.selectedIdChange.emit(null);
        this.validityChange.emit(true);
      } else {
        this.validityChange.emit(false);
      }
      return;
    }

    const matched = this.options.find((o) => o.label.toLowerCase() === text.toLowerCase());
    if (matched) {
      this.el.nativeElement.value = matched.label;
      if (this.selectedId !== matched.id) {
        this.selectedId = matched.id;
        this.selectedIdChange.emit(matched.id);
      }
      this.validityChange.emit(true);
    } else {
      this.selectedId = null;
      this.selectedIdChange.emit(null);
      this.validityChange.emit(false);
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.isOpen) {
      this.updatePosition();
    }
  }

  private updatePosition() {
    if (!this.dropdownEl) return;
    const input = this.el.nativeElement as HTMLInputElement;
    const top = input.offsetTop + input.offsetHeight + 4;
    const left = input.offsetLeft;
    const width = input.offsetWidth;

    this.renderer.setStyle(this.dropdownEl, 'top', `${top}px`);
    this.renderer.setStyle(this.dropdownEl, 'left', `${left}px`);
    this.renderer.setStyle(this.dropdownEl, 'width', `${width}px`);
  }

  private createDropdown() {
    const parent = this.el.nativeElement.parentElement;
    if (parent) {
      this.renderer.setStyle(parent, 'position', 'relative');
    }

    this.dropdownEl = this.renderer.createElement('div');
    this.renderer.addClass(this.dropdownEl, 'autocomplete-dropdown-panel');
    this.renderer.setStyle(this.dropdownEl, 'position', 'absolute');
    this.renderer.setStyle(this.dropdownEl, 'z-index', '1000');
    this.renderer.setStyle(this.dropdownEl, 'background', 'var(--glass-dropdown-bg, rgba(15, 23, 42, 0.94))');
    this.renderer.setStyle(this.dropdownEl, 'backdrop-filter', 'blur(20px)');
    this.renderer.setStyle(this.dropdownEl, '-webkit-backdrop-filter', 'blur(20px)');
    this.renderer.setStyle(this.dropdownEl, 'border', '1px solid var(--glass-dropdown-border, rgba(255, 255, 255, 0.12))');
    this.renderer.setStyle(this.dropdownEl, 'border-radius', '8px');
    this.renderer.setStyle(this.dropdownEl, 'max-height', '220px');
    this.renderer.setStyle(this.dropdownEl, 'overflow-y', 'auto');
    this.renderer.setStyle(this.dropdownEl, 'display', 'none');
    this.renderer.setStyle(
      this.dropdownEl,
      'box-shadow',
      'var(--glass-dropdown-shadow, 0 20px 45px -10px rgba(0, 0, 0, 0.65))',
    );

    if (parent) {
      this.renderer.appendChild(parent, this.dropdownEl);
    } else {
      this.renderer.appendChild(document.body, this.dropdownEl);
    }
  }

  private renderDropdown() {
    if (!this.dropdownEl) return;

    while (this.dropdownEl.firstChild) {
      this.dropdownEl.removeChild(this.dropdownEl.firstChild);
    }

    if (this.filteredOptions.length === 0) {
      const emptyItem = this.renderer.createElement('div');
      this.renderer.addClass(emptyItem, 'autocomplete-empty-item');
      this.renderer.setStyle(emptyItem, 'padding', '10px 14px');
      this.renderer.setStyle(emptyItem, 'font-size', '0.82rem');
      this.renderer.setStyle(emptyItem, 'color', 'var(--text-muted, #94a3b8)');
      emptyItem.textContent = 'No matching product found';
      this.renderer.appendChild(this.dropdownEl, emptyItem);
    } else {
      this.filteredOptions.forEach((opt, idx) => {
        const item = this.renderer.createElement('div');
        this.renderer.addClass(item, 'autocomplete-option-item');
        this.renderer.setAttribute(item, 'data-index', idx.toString());
        this.renderer.setStyle(item, 'padding', '9px 14px');
        this.renderer.setStyle(item, 'cursor', 'pointer');
        this.renderer.setStyle(item, 'font-size', '0.86rem');
        this.renderer.setStyle(item, 'color', 'var(--text-primary, #f8fafc)');
        this.renderer.setStyle(item, 'border-bottom', '1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.05))');
        this.renderer.setStyle(item, 'transition', 'background-color 0.12s ease');

        item.addEventListener('mouseenter', () => {
          this.activeIndex = idx;
          this.updateActiveHighlight();
        });

        item.textContent = opt.label;

        item.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          this.selectOption(opt);
        });

        this.renderer.appendChild(this.dropdownEl, item);
      });
    }

    this.updatePosition();
    this.isOpen = true;
    this.renderer.setStyle(this.dropdownEl, 'display', 'block');
    this.updateActiveHighlight();
  }

  private updateActiveHighlight() {
    if (!this.dropdownEl) return;
    const items = this.dropdownEl.querySelectorAll('.autocomplete-option-item');
    items.forEach((item, idx) => {
      const htmlItem = item as HTMLElement;
      if (idx === this.activeIndex) {
        this.renderer.setStyle(htmlItem, 'background-color', 'var(--primary-light, rgba(16, 185, 129, 0.2))');
        this.renderer.setStyle(htmlItem, 'color', 'var(--primary, #10b981)');
        if (typeof htmlItem.scrollIntoView === 'function') {
          htmlItem.scrollIntoView({ block: 'nearest' });
        }
      } else {
        this.renderer.setStyle(htmlItem, 'background-color', 'transparent');
        this.renderer.setStyle(htmlItem, 'color', 'var(--text-primary, #f8fafc)');
      }
    });
  }

  private selectOption(opt: AutocompleteOption) {
    this.el.nativeElement.value = opt.label;
    this.selectedId = opt.id;
    this.selectedIdChange.emit(opt.id);
    this.validityChange.emit(true);
    this.closeDropdown();
  }

  private closeDropdown() {
    this.isOpen = false;
    this.activeIndex = -1;
    if (this.dropdownEl) {
      this.renderer.setStyle(this.dropdownEl, 'display', 'none');
    }
  }
}
