<template>
  <div class="loginContainer">
    <section class="loginBrand" aria-label="Linker">
      <div class="loginBrandTop">
        <span class="loginMark" aria-hidden="true">L</span>
        <div class="loginBrandCopy">
          <span class="loginBrandName">Linker</span>
          <span class="loginBrandTag">WMS × Ecommerce</span>
        </div>
      </div>

      <div class="loginBrandInner">
        <p class="loginKicker">Warehouse portal</p>
        <figure class="loginHero">
          <img
            class="loginHeroImg"
            src="/7694929c-75a7-4783-847c-854eb93805ef.png"
            alt="Linker connecting warehouse inventory with your ecommerce storefront"
            width="1200"
            height="675"
            decoding="async"
          />
        </figure>
        <h1 class="loginHeadline">
          Stock to shipping,
          <em>always in sync.</em>
        </h1>
        <p class="loginLede">
          Sign in to manage inventory, pick orders, and keep your storefront aligned with the warehouse.
        </p>
      </div>

      <p class="loginBrandFoot">WMS Linker · Fulfillment operations</p>
    </section>

    <section class="loginPanel">
      <div class="loginPanelLang">
        <LanguagesSwitch />
      </div>
      <div class="loginCard">
        <LoginForm />
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
import LoginForm from '@/components/login/login-form.vue'
import LanguagesSwitch from '@/components/system/languages.vue'
import { emitter } from '@/utils/bus'

onMounted(() => {
  emitter.emit('closeLoading')
})
</script>

<style scoped lang="less">
.loginContainer {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  background: #f4f7fb;
  color: #152033;
  overflow: auto;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.loginBrand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  padding: clamp(1.4rem, 3.5vw, 2.4rem) clamp(1.5rem, 4vw, 3.2rem);
  overflow: hidden;
  background:
    radial-gradient(ellipse 70% 55% at 18% 22%, rgba(37, 99, 235, 0.14), transparent 58%),
    radial-gradient(ellipse 55% 45% at 88% 78%, rgba(232, 89, 12, 0.1), transparent 55%),
    linear-gradient(165deg, #eef3f9 0%, #f7f9fc 48%, #eef2f7 100%);
}

.loginBrandTop {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.loginMark {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 0.65rem;
  background: linear-gradient(145deg, #3b82f6, #1d4ed8);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
}

.loginBrandCopy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.loginBrandName {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.loginBrandTag {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5b6b7c;
}

.loginBrandInner {
  display: grid;
  gap: 1.1rem;
  max-width: 42rem;
  padding-block: 1rem 0.5rem;
}

.loginKicker {
  margin: 0;
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.loginHero {
  margin: 0;
  border-radius: 1.15rem;
  overflow: hidden;
  border: 1px solid rgba(21, 32, 51, 0.08);
  background: #fffef9;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 18px 40px rgba(21, 32, 51, 0.08);
}

.loginHeroImg {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(46vh, 420px);
  object-fit: contain;
  object-position: center;
  background: #fffef9;
}

.loginHeadline {
  margin: 0;
  font-size: clamp(1.65rem, 3.2vw, 2.35rem);
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.03em;

  em {
    display: block;
    margin-top: 0.12em;
    color: #2563eb;
    font-style: normal;
    font-weight: 700;
  }
}

.loginLede {
  margin: 0;
  max-width: 32rem;
  color: #5b6b7c;
  font-size: 0.95rem;
  line-height: 1.55;
}

.loginBrandFoot {
  margin: 0;
  color: rgba(91, 107, 124, 0.9);
  font-size: 0.76rem;
}

.loginPanel {
  position: relative;
  display: grid;
  place-items: center;
  padding: clamp(1.5rem, 4vw, 3rem);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), transparent 28%),
    #f8fafc;
}

.loginPanelLang {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
}

.loginCard {
  width: min(100%, 26rem);
  padding: clamp(1.5rem, 3vw, 2.15rem);
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 1.1rem;
  background: #fff;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.85) inset,
    0 16px 40px rgba(21, 32, 51, 0.07);
}

@media (max-width: 900px) {
  .loginContainer {
    grid-template-columns: 1fr;
  }

  .loginBrand {
    min-height: auto;
    padding: 1.2rem 1.2rem 1.35rem;
  }

  .loginBrandFoot {
    display: none;
  }

  .loginBrandInner {
    padding-block: 0.75rem 0.2rem;
    gap: 0.85rem;
  }

  .loginHeroImg {
    max-height: 220px;
  }

  .loginHeadline {
    font-size: 1.55rem;
  }

  .loginLede {
    font-size: 0.88rem;
  }

  .loginPanel {
    padding: 1.15rem 1.15rem 2rem;
  }

  .loginCard {
    width: 100%;
  }
}
</style>
