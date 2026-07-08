<script lang="ts">
  import type { SupabaseClient, User } from '@supabase/supabase-js';
  import { validateNickname } from '$lib/domain/nickname/nickname';
  import { clearSave } from '$lib/stores/savegame';

  let { supabase }: { supabase: SupabaseClient } = $props();

  let user = $state<User | null>(null);
  let nickname = $state('');
  let savedNickname = $state<string | null>(null);
  let message = $state<string | null>(null);
  let confirmingDelete = $state(false);

  const isGoogleLinked = $derived(
    user?.identities?.some((i) => i.provider === 'google') ?? false,
  );

  $effect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      user = data.user;
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', data.user.id)
        .maybeSingle();
      savedNickname = profile?.nickname ?? null;
    });
  });

  async function linkGoogle() {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: location.origin },
    });
    if (error) message = 'Google bağlantısı başarısız: ' + error.message;
  }

  async function claimNickname() {
    const verdict = validateNickname(nickname);
    if (!verdict.ok) {
      message = verdict.reason;
      return;
    }
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: verdict.value }),
    });
    if (res.ok) {
      savedNickname = verdict.value;
      message = null;
    } else {
      message = (await res.json().catch(() => null))?.message ?? 'Kaydedilemedi';
    }
  }

  async function deleteAccount() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (res.ok) {
      await supabase.auth.signOut();
      clearSave(localStorage);
      location.reload();
    } else {
      message = 'Hesap silinemedi, tekrar dene';
      confirmingDelete = false;
    }
  }
</script>

<section class="rounded border border-term-border bg-term-panel p-3 font-mono text-sm">
  <h2 class="mb-2 text-term-blue">HESAP</h2>

  {#if user == null}
    <p class="text-term-text opacity-50">Oturum açılıyor…</p>
  {:else}
    <p class="mb-2">
      Durum:
      {#if isGoogleLinked}
        <span class="text-term-green">Google bağlı</span>
      {:else}
        <span class="text-term-amber">Misafir</span>
        <button class="ml-2 border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={linkGoogle}>
          GOOGLE İLE BAĞLA
        </button>
      {/if}
    </p>

    <div class="mb-2 flex items-center gap-2">
      <label for="nickname" class="text-term-text opacity-50">Takma ad:</label>
      {#if savedNickname}
        <span class="text-term-green">{savedNickname}</span>
      {:else}
        <input
          id="nickname"
          class="w-40 border border-term-border bg-transparent px-1"
          bind:value={nickname}
          maxlength="20"
        />
        <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={claimNickname}>
          AL
        </button>
      {/if}
    </div>

    <button class="text-term-red underline" onclick={deleteAccount}>
      {confirmingDelete ? 'EMİN MİSİN? (geri dönüşü yok)' : 'Hesabımı ve verilerimi sil'}
    </button>
  {/if}

  {#if message}
    <p class="mt-2 text-term-amber">{message}</p>
  {/if}
</section>
